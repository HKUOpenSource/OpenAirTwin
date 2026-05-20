#!/usr/bin/env python3
from __future__ import annotations

import argparse
from dataclasses import dataclass
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import venv


PROJECT_ROOT = Path(__file__).resolve().parent
VENV_DIR = PROJECT_ROOT / ".venv"
ENV_FILE = PROJECT_ROOT / ".oat-env"
REQUIREMENTS_FILE = PROJECT_ROOT / "requirements.txt"
MIN_PYTHON = (3, 11)


@dataclass(frozen=True)
class GpuInfo:
    index: str
    name: str
    uuid: str | None = None


@dataclass(frozen=True)
class DoctorResult:
    status: str
    name: str
    detail: str
    suggestion: str = ""


def platform_key(system_name: str | None = None) -> str:
    name = (system_name or platform.system()).lower()
    if name.startswith("darwin"):
        return "macos"
    if name.startswith("win"):
        return "windows"
    if name.startswith("linux"):
        return "linux"
    return name or "unknown"


def python_version_ok(version_info: tuple[int, int, int] | tuple[int, int]) -> bool:
    return tuple(version_info[:2]) >= MIN_PYTHON


def python_version_message(version_info: tuple[int, ...] | None = None) -> str:
    version = version_info or sys.version_info
    current = ".".join(str(part) for part in version[:3])
    required = ".".join(str(part) for part in MIN_PYTHON)
    return f"Python {required}+ is required; current interpreter is Python {current}."


def venv_python_path(venv_dir: Path = VENV_DIR, system_name: str | None = None) -> Path:
    if platform_key(system_name) == "windows":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def parse_nvidia_smi_gpus(output: str) -> list[GpuInfo]:
    gpus: list[GpuInfo] = []
    pattern = re.compile(r"^\s*GPU\s+(\d+):\s*(.*?)\s*(?:\(UUID:\s*([^)]+)\))?\s*$")
    for line in output.splitlines():
        match = pattern.match(line)
        if not match:
            continue
        index, name, uuid = match.groups()
        gpus.append(GpuInfo(index=index, name=name.strip(), uuid=uuid.strip() if uuid else None))
    return gpus


def find_nvidia_smi() -> str | None:
    return shutil.which("nvidia-smi")


def detect_nvidia_gpus() -> tuple[list[GpuInfo], str]:
    executable = find_nvidia_smi()
    if not executable:
        return [], "nvidia-smi was not found"
    try:
        completed = subprocess.run(
            [executable, "-L"],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except Exception as exc:
        return [], f"nvidia-smi failed: {exc}"
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "nvidia-smi returned a non-zero exit code").strip()
        return [], detail
    return parse_nvidia_smi_gpus(completed.stdout), completed.stdout.strip()


def resolve_gpu_selection(selection: str, gpus: list[GpuInfo]) -> str:
    text = str(selection).strip()
    if not text:
        raise ValueError("GPU selection cannot be empty")
    for gpu in gpus:
        if text == gpu.index:
            return gpu.index
        if gpu.uuid and (text == gpu.uuid or gpu.uuid.startswith(text)):
            return gpu.uuid
    if not gpus:
        return text
    valid = ", ".join(
        gpu.index if not gpu.uuid else f"{gpu.index} ({gpu.uuid})"
        for gpu in gpus
    )
    raise ValueError(f"Unknown GPU '{selection}'. Available GPUs: {valid}")


def choose_gpu_value(
    gpus: list[GpuInfo],
    *,
    requested_gpu: str | None,
    force_cpu: bool,
    assume_yes: bool,
) -> tuple[str | None, str]:
    if force_cpu:
        return "", "CPU mode requested; CUDA_VISIBLE_DEVICES will be empty."
    if requested_gpu is not None:
        return resolve_gpu_selection(requested_gpu, gpus), f"Using requested GPU {requested_gpu}."
    if not gpus:
        return None, "No NVIDIA GPU detected; CPU/LLVM fallback will be used when available."
    if len(gpus) == 1:
        return gpus[0].index, f"One NVIDIA GPU detected; using GPU {gpus[0].index}."
    if assume_yes or not sys.stdin.isatty():
        return None, "Multiple NVIDIA GPUs detected; leaving CUDA_VISIBLE_DEVICES unset. Re-run with --gpu to pin one."

    print("Multiple NVIDIA GPUs were detected:")
    for gpu in gpus:
        uuid_text = f" [{gpu.uuid}]" if gpu.uuid else ""
        print(f"  {gpu.index}: {gpu.name}{uuid_text}")
    answer = input("Select GPU index/UUID, or press Enter to leave unset: ").strip()
    if not answer:
        return None, "GPU selection skipped; CUDA_VISIBLE_DEVICES will be left unset."
    return resolve_gpu_selection(answer, gpus), f"Using selected GPU {answer}."


def shell_quote(value: str) -> str:
    if value == "":
        return "''"
    if re.match(r"^[A-Za-z0-9_./:@%+=,-]+$", value):
        return value
    return "'" + value.replace("'", "'\"'\"'") + "'"


def build_env_values(
    *,
    python_executable: Path,
    gpu_value: str | None,
    system_name: str | None = None,
) -> dict[str, str]:
    values = {
        "OAT_HOST": "127.0.0.1",
        "OAT_PORT": "8090",
        "OAT_DEEPMIMO_ENV_PYTHON": str(python_executable),
    }
    if gpu_value is not None:
        values["CUDA_VISIBLE_DEVICES"] = gpu_value
    if platform_key(system_name) == "windows":
        paths = windows_cache_paths(os.environ)
        values["CUDA_CACHE_PATH"] = str(paths["cuda_cache"])
    return values


def format_env_file(values: dict[str, str]) -> str:
    lines = [
        "# OpenAirTwin local runtime environment.",
        "# Generated by install.py. This file is intentionally not committed.",
    ]
    for key in sorted(values):
        lines.append(f"{key}={shell_quote(values[key])}")
    return "\n".join(lines) + "\n"


def write_env_file(values: dict[str, str], path: Path = ENV_FILE, *, dry_run: bool = False) -> None:
    if dry_run:
        print(f"[dry-run] Would write {path}")
        return
    path.write_text(format_env_file(values), encoding="utf-8")
    print(f"Wrote local environment config: {path}")


def windows_cache_paths(env: dict[str, str] | os._Environ[str]) -> dict[str, Path]:
    temp_root = Path(env.get("TEMP") or env.get("TMP") or tempfile.gettempdir())
    appdata_root = Path(env.get("APPDATA") or (Path.home() / "AppData" / "Roaming"))
    drjit_cache = temp_root / "drjit"
    return {
        "drjit_cache": drjit_cache,
        "cuda_cache": appdata_root / "NVIDIA" / "ComputeCache",
        "optix_cache": drjit_cache,
    }


def directory_writable(path: Path, *, create: bool = False) -> tuple[bool, str]:
    try:
        if create:
            path.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            return False, "missing"
        if not path.is_dir():
            return False, "not a directory"
        with tempfile.NamedTemporaryFile(prefix=".oat-write-test-", dir=str(path), delete=True):
            pass
        return True, "writable"
    except Exception as exc:
        return False, str(exc)


def llvm_install_hint(system_name: str | None = None) -> str:
    key = platform_key(system_name)
    if key == "macos":
        return "Install LLVM with: brew install llvm"
    if key == "linux":
        return "Install LLVM with: sudo apt install llvm"
    if key == "windows":
        return "Install the official LLVM Windows installer, then reopen PowerShell."
    return "Install LLVM for your operating system and make sure it is visible to Python."


def windows_cache_hint() -> str:
    return (
        "Close Python processes, clear stale files in %TEMP%\\drjit and "
        "%APPDATA%\\NVIDIA\\ComputeCache if needed, then rerun install.py --doctor."
    )


def run_probe(python_executable: Path, code: str, *, timeout: float = 30.0) -> tuple[bool, str]:
    try:
        completed = subprocess.run(
            [str(python_executable), "-c", code],
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except Exception as exc:
        return False, str(exc)
    output = (completed.stdout or completed.stderr or "").strip()
    if completed.returncode != 0:
        return False, output or f"exit code {completed.returncode}"
    return True, output or "ok"


def python_executable_for_doctor() -> Path:
    candidate = venv_python_path()
    if candidate.exists():
        return candidate
    return Path(sys.executable)


def collect_doctor_results(
    *,
    python_executable: Path | None = None,
    create_windows_cache_dirs: bool = False,
    system_name: str | None = None,
) -> list[DoctorResult]:
    results: list[DoctorResult] = []
    py = python_executable or python_executable_for_doctor()
    system = platform_key(system_name)

    if python_version_ok(sys.version_info):
        results.append(DoctorResult("PASS", "bootstrap python", sys.version.split()[0]))
    else:
        results.append(DoctorResult("FAIL", "bootstrap python", python_version_message(), "Run install.py with Python 3.11+."))

    if py.exists():
        results.append(DoctorResult("PASS", "runtime python", str(py)))
    else:
        results.append(DoctorResult("FAIL", "runtime python", f"{py} does not exist", "Run python install.py first."))
        return results

    ok, detail = run_probe(py, "import sys; print(sys.version.split()[0])", timeout=10)
    if ok and python_version_ok(tuple(int(part) for part in detail.split(".")[:3])):
        results.append(DoctorResult("PASS", "runtime python version", detail))
    elif ok:
        results.append(DoctorResult("FAIL", "runtime python version", python_version_message(tuple(int(part) for part in detail.split(".")[:3]))))
    else:
        results.append(DoctorResult("FAIL", "runtime python version", detail))

    ok, detail = run_probe(py, "import pip; print(pip.__version__)", timeout=10)
    results.append(DoctorResult("PASS" if ok else "FAIL", "pip", detail, "" if ok else "Run python -m ensurepip --upgrade."))

    import_checks = [
        ("numpy", "import numpy as m; print(m.__version__)"),
        ("trimesh", "import trimesh as m; print(m.__version__)"),
        ("drjit", "import drjit as m; print(getattr(m, '__version__', 'unknown'))"),
        ("mitsuba", "import mitsuba as m; print(getattr(m, '__version__', 'unknown'))"),
        ("sionna.rt", "from sionna.rt import load_scene; print('ok')"),
        ("deepmimo", "import deepmimo as m; print(getattr(m, '__version__', 'unknown'))"),
    ]
    for name, code in import_checks:
        ok, detail = run_probe(py, code, timeout=30)
        results.append(
            DoctorResult(
                "PASS" if ok else "FAIL",
                f"import {name}",
                detail,
                "" if ok else "Run python install.py to install requirements.txt into .venv.",
            )
        )

    variants_code = (
        "import mitsuba as mi; "
        "variants = mi.variants() if hasattr(mi, 'variants') else []; "
        "print(','.join(variants))"
    )
    ok, detail = run_probe(py, variants_code, timeout=30)
    if ok:
        missing = [variant for variant in ("llvm_ad_rgb", "cuda_ad_rgb") if variant not in detail.split(",")]
        status = "PASS" if not missing else "WARN"
        suggestion = "" if not missing else "Mitsuba wheel should normally expose llvm_ad_rgb and cuda_ad_rgb variants."
        results.append(DoctorResult(status, "Mitsuba variants", detail or "no variants reported", suggestion))
    else:
        results.append(DoctorResult("FAIL", "Mitsuba variants", detail))

    gpus, gpu_detail = detect_nvidia_gpus()
    if gpus:
        detail = "; ".join(f"{gpu.index}: {gpu.name}" for gpu in gpus)
        results.append(DoctorResult("PASS", "NVIDIA GPU detection", detail))
    else:
        results.append(DoctorResult("WARN", "NVIDIA GPU detection", gpu_detail, "CPU fallback requires the Dr.Jit LLVM backend."))

    llvm_code = (
        "import drjit as dr\n"
        "from drjit.llvm import Float\n"
        "x = dr.arange(Float, 4)\n"
        "dr.eval(x)\n"
        "print('ok')\n"
    )
    ok, detail = run_probe(py, llvm_code, timeout=30)
    if ok:
        results.append(DoctorResult("PASS", "Dr.Jit LLVM backend", detail))
    else:
        status = "WARN" if gpus else "FAIL"
        results.append(DoctorResult(status, "Dr.Jit LLVM backend", detail, llvm_install_hint(system)))

    if gpus:
        cuda_code = (
            "import drjit as dr\n"
            "from drjit.cuda import Float\n"
            "x = dr.arange(Float, 4)\n"
            "dr.eval(x)\n"
            "print('ok')\n"
        )
        ok, detail = run_probe(py, cuda_code, timeout=45)
        results.append(
            DoctorResult(
                "PASS" if ok else "WARN",
                "Dr.Jit CUDA backend",
                detail,
                "" if ok else "Check NVIDIA driver/CUDA compatibility and CUDA_VISIBLE_DEVICES.",
            )
        )

    if system == "windows":
        for label, path in windows_cache_paths(os.environ).items():
            ok, detail = directory_writable(path, create=create_windows_cache_dirs)
            results.append(
                DoctorResult(
                    "PASS" if ok else "WARN",
                    f"Windows {label}",
                    f"{path}: {detail}",
                    "" if ok else windows_cache_hint(),
                )
            )

    return results


def print_doctor_report(results: list[DoctorResult]) -> None:
    widths = {"PASS": 0, "WARN": 0, "FAIL": 0}
    for result in results:
        widths[result.status] = widths.get(result.status, 0) + 1
        print(f"[{result.status}] {result.name}: {result.detail}")
        if result.suggestion:
            print(f"       {result.suggestion}")
    print(
        f"Summary: {widths.get('PASS', 0)} PASS, "
        f"{widths.get('WARN', 0)} WARN, {widths.get('FAIL', 0)} FAIL"
    )


def has_failures(results: list[DoctorResult]) -> bool:
    return any(result.status == "FAIL" for result in results)


def run_command(command: list[str], *, dry_run: bool = False) -> None:
    display = " ".join(shell_quote(part) for part in command)
    if dry_run:
        print(f"[dry-run] {display}")
        return
    print(display)
    subprocess.run(command, check=True)


def recreate_venv_if_requested(venv_dir: Path, *, recreate: bool, dry_run: bool = False) -> None:
    if not recreate or not venv_dir.exists():
        return
    if dry_run:
        print(f"[dry-run] Would remove {venv_dir}")
        return
    shutil.rmtree(venv_dir)


def ensure_venv(venv_dir: Path = VENV_DIR, *, recreate: bool = False, dry_run: bool = False) -> Path:
    recreate_venv_if_requested(venv_dir, recreate=recreate, dry_run=dry_run)
    python_path = venv_python_path(venv_dir)
    if python_path.exists():
        print(f"Using existing virtual environment: {venv_dir}")
        return python_path
    if dry_run:
        print(f"[dry-run] Would create virtual environment: {venv_dir}")
        return python_path
    print(f"Creating virtual environment: {venv_dir}")
    venv.EnvBuilder(with_pip=True).create(str(venv_dir))
    return python_path


def launch_command(system_name: str | None = None) -> str:
    py = venv_python_path()
    if platform_key(system_name) == "windows":
        return ".\\.venv\\Scripts\\python.exe -m backend.server"
    return "set -a; . ./.oat-env; set +a; ./.venv/bin/python -m backend.server"


def run_install(args: argparse.Namespace) -> int:
    if not args.dry_run and not python_version_ok(sys.version_info):
        print(python_version_message(), file=sys.stderr)
        return 2
    if args.dry_run and not python_version_ok(sys.version_info):
        print(f"[dry-run] {python_version_message()}")

    if not REQUIREMENTS_FILE.exists() and not args.dry_run:
        print(f"Missing requirements file: {REQUIREMENTS_FILE}", file=sys.stderr)
        return 2

    python_path = ensure_venv(VENV_DIR, recreate=args.recreate_venv, dry_run=args.dry_run)
    run_command([str(python_path), "-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"], dry_run=args.dry_run)
    run_command([str(python_path), "-m", "pip", "install", "-r", str(REQUIREMENTS_FILE)], dry_run=args.dry_run)

    gpus, gpu_detail = detect_nvidia_gpus()
    if gpu_detail:
        print(f"GPU detection: {gpu_detail}")
    try:
        gpu_value, gpu_message = choose_gpu_value(
            gpus,
            requested_gpu=args.gpu,
            force_cpu=args.cpu,
            assume_yes=args.yes,
        )
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    print(gpu_message)

    if platform_key() == "windows" and not args.dry_run:
        for path in windows_cache_paths(os.environ).values():
            directory_writable(path, create=True)

    env_values = build_env_values(python_executable=python_path, gpu_value=gpu_value)
    write_env_file(env_values, ENV_FILE, dry_run=args.dry_run)

    if args.dry_run:
        print("Dry run complete; no virtual environment or local env file was changed.")
        return 0

    print("Running environment doctor...")
    results = collect_doctor_results(python_executable=python_path, create_windows_cache_dirs=True)
    print_doctor_report(results)
    print()
    print("Start OpenAirTwin with:")
    print(f"  {launch_command()}")
    if platform_key() == "windows":
        print("PowerShell users can set variables from .oat-env manually or run the printed python command after setting them.")
    return 1 if has_failures(results) else 0


def run_doctor() -> int:
    results = collect_doctor_results()
    print_doctor_report(results)
    return 1 if has_failures(results) else 0


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Install and diagnose OpenAirTwin runtime dependencies.")
    parser.add_argument("--doctor", action="store_true", help="Run environment checks without installing packages.")
    parser.add_argument("--yes", action="store_true", help="Use non-interactive defaults.")
    parser.add_argument("--recreate-venv", action="store_true", help="Remove and recreate .venv before installing.")
    parser.add_argument("--dry-run", action="store_true", help="Show actions without creating .venv or writing local config.")
    gpu_group = parser.add_mutually_exclusive_group()
    gpu_group.add_argument("--gpu", help="Pin CUDA_VISIBLE_DEVICES to a GPU index or UUID.")
    gpu_group.add_argument("--cpu", action="store_true", help="Force CPU mode by setting CUDA_VISIBLE_DEVICES to empty.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.doctor:
        return run_doctor()
    return run_install(args)


if __name__ == "__main__":
    raise SystemExit(main())
