#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


DEFAULT_BASE_URL = "http://100.65.77.20:8090"


class SmokeFailure(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="HTTP-only smoke test for the HKU-RT backend.")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("HKU_RT_SMOKE_BASE_URL", DEFAULT_BASE_URL),
        help=f"Backend base URL. Defaults to {DEFAULT_BASE_URL} or HKU_RT_SMOKE_BASE_URL.",
    )
    parser.add_argument("--timeout", type=float, default=30.0, help="HTTP request timeout in seconds.")
    parser.add_argument("--poll-timeout", type=float, default=90.0, help="Radio-map job poll timeout in seconds.")
    parser.add_argument("--poll-interval", type=float, default=1.0, help="Radio-map job poll interval in seconds.")
    return parser.parse_args()


def build_url(base_url: str, path: str) -> str:
    return base_url.rstrip("/") + path


def request_raw(
    base_url: str,
    path: str,
    *,
    method: str = "GET",
    payload: dict | None = None,
    headers: dict[str, str] | None = None,
    timeout: float,
):
    data = None
    request_headers = dict(headers or {})
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")
    request = urllib.request.Request(
        build_url(base_url, path),
        data=data,
        headers=request_headers,
        method=method,
    )
    return urllib.request.urlopen(request, timeout=timeout)


def request_json(
    base_url: str,
    path: str,
    *,
    method: str = "GET",
    payload: dict | None = None,
    timeout: float,
) -> dict:
    try:
        with request_raw(base_url, path, method=method, payload=payload, timeout=timeout) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SmokeFailure(f"{method} {path} failed with HTTP {exc.code}: {body}") from exc
    try:
        return json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise SmokeFailure(f"{method} {path} returned invalid JSON") from exc


def ok(message: str) -> None:
    print(f"[ok] {message}", flush=True)


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise SmokeFailure(message)


def smoke_health(base_url: str, timeout: float) -> None:
    health = request_json(base_url, "/api/health", timeout=timeout)
    assert_true(health.get("ok") is True, "/api/health did not return ok=true")
    ok(f"health scene={health.get('scene_xml')}")


def smoke_manifest(base_url: str, timeout: float) -> dict:
    manifest = request_json(base_url, "/api/scene/manifest", timeout=timeout)
    assert_true(int(manifest.get("mesh_count", 0)) > 0, "manifest has no meshes")
    assert_true(len(manifest.get("bundles") or []) > 0, "manifest has no bundles")
    ok(f"manifest meshes={manifest.get('mesh_count')} bundles={manifest.get('bundle_count')}")
    return manifest


def smoke_bundle(base_url: str, manifest: dict, timeout: float) -> None:
    bundles = manifest.get("bundles") or []
    bundle = next((item for item in bundles if item.get("compressed_cache_exists")), None)
    if bundle is None:
        raise SmokeFailure(
            "No manifest bundle has compressed_cache_exists=true. "
            "Pre-compress bundles on the remote, for example with "
            "python3 -m backend.tools.build_tile_bundles --compress."
        )

    bundle_id = urllib.parse.quote(str(bundle["bundle_id"]), safe="")
    cache_key = urllib.parse.quote(str(bundle.get("cache_key") or "smoke"), safe="")
    path = f"/api/scene/bundle/{bundle_id}?v={cache_key}"
    with request_raw(
        base_url,
        path,
        headers={"Accept-Encoding": "gzip"},
        timeout=timeout,
    ) as response:
        body = response.read()
        etag = response.headers.get("ETag")
        assert_true(response.headers.get("Content-Encoding") == "gzip", "bundle response was not gzip encoded")
        assert_true(bool(etag), "bundle response did not include an ETag")
        assert_true(gzip.decompress(body).startswith(b"glTF"), "decompressed bundle is not a GLB payload")

    request = urllib.request.Request(
        build_url(base_url, path),
        headers={"Accept-Encoding": "gzip", "If-None-Match": etag or ""},
    )
    try:
        urllib.request.urlopen(request, timeout=timeout)
    except urllib.error.HTTPError as exc:
        if exc.code == 304:
            ok(f"bundle gzip+304 id={bundle['bundle_id']}")
            return
        raise SmokeFailure(f"bundle cache validation returned HTTP {exc.code}") from exc
    raise SmokeFailure("bundle cache validation expected HTTP 304 but received 200")


def smoke_link(base_url: str, timeout: float) -> None:
    result = request_json(
        base_url,
        "/api/link/solve",
        method="POST",
        payload={
            "solver": {
                "max_depth": 2,
                "samples_per_src": 1000,
                "seed": 42,
            }
        },
        timeout=timeout,
    )
    assert_true(result.get("ok") is True, "link solve did not return ok=true")
    summary = result.get("summary") or {}
    assert_true("valid_paths" in summary, "link solve summary did not include valid_paths")
    ok(f"link valid_paths={summary.get('valid_paths')}")


def smoke_advanced_link(base_url: str, timeout: float) -> None:
    result = request_json(
        base_url,
        "/api/link/solve",
        method="POST",
        payload={
            "solver": {
                "max_depth": 2,
                "samples_per_src": 1000,
                "max_num_paths_per_src": 1000,
                "synthetic_array": False,
                "diffraction": False,
                "edge_diffraction": False,
                "diffraction_lit_region": False,
                "seed": 43,
            },
            "channel": {
                "compute_taps": True,
                "l_min": 0,
                "l_max": 4,
                "fft_size": 128,
                "subcarrier_spacing_hz": 30000,
            },
        },
        timeout=timeout,
    )
    assert_true(result.get("ok") is True, "advanced link solve did not return ok=true")
    channel = result.get("channel") or {}
    assert_true(len(channel.get("tap_indices") or []) == 5, "advanced link did not return five tap indices")
    assert_true(len(channel.get("power_db") or []) == 5, "advanced link did not return five tap powers")
    assert_true("cir_summary" in channel, "advanced link did not return cir_summary")
    ok(f"advanced link taps={len(channel.get('tap_indices') or [])}")


def smoke_radiomap(base_url: str, timeout: float, poll_timeout: float, poll_interval: float) -> None:
    created = request_json(
        base_url,
        "/api/radiomap/jobs",
        method="POST",
        payload={
            "surface": {
                "type": "terrain_patch",
                "size": [160.0, 160.0],
                "height_offset": 1.5,
                "density_level": 1,
            },
            "solver": {
                "max_depth": 2,
                "samples_per_tx": 1000,
                "seed": 42,
            },
        },
        timeout=timeout,
    )
    job_id = created.get("job_id")
    assert_true(isinstance(job_id, str) and bool(job_id), "radio-map create did not return a job_id")

    deadline = time.time() + poll_timeout
    while time.time() < deadline:
        job = request_json(base_url, f"/api/radiomap/jobs/{urllib.parse.quote(job_id)}", timeout=timeout)
        status = job.get("status")
        if status == "succeeded":
            result = request_json(base_url, f"/api/radiomap/jobs/{urllib.parse.quote(job_id)}/result", timeout=timeout)
            values = result.get("values") or {}
            assert_true(int(values.get("count", 0)) > 0, "radio-map result has no values")
            ok(f"radio-map job={job_id} cells={values.get('count')}")
            return
        if status == "failed":
            raise SmokeFailure(f"radio-map job failed: {job.get('message') or job.get('error')}")
        time.sleep(poll_interval)

    raise SmokeFailure(f"radio-map job {job_id} did not finish within {poll_timeout:.0f}s")


def main() -> int:
    args = parse_args()
    base_url = args.base_url.rstrip("/")
    print(f"Smoke target: {base_url}", flush=True)
    try:
        smoke_health(base_url, args.timeout)
        manifest = smoke_manifest(base_url, args.timeout)
        smoke_bundle(base_url, manifest, args.timeout)
        smoke_link(base_url, args.timeout)
        smoke_advanced_link(base_url, args.timeout)
        smoke_radiomap(base_url, args.timeout, args.poll_timeout, args.poll_interval)
    except SmokeFailure as exc:
        print(f"[fail] {exc}", file=sys.stderr)
        return 1
    print("[ok] smoke complete", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
