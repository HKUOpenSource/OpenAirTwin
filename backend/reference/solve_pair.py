#!/usr/bin/env python3
import json, os, sys
import numpy as np
from pathlib import Path
from sionna.rt import load_scene, Transmitter, Receiver, PlanarArray, PathSolver, InteractionType

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parent
REFERENCE_XML = Path(os.environ.get('OAT_REFERENCE_XML', str(WORKSPACE / 'reference.xml')))

def main():
    req = json.loads(sys.stdin.read() or '{}')
    tx = req.get('tx', [72.0, 37.0, 40.0])
    rx = req.get('rx', [72.0, 37.0, 1.5])

    max_depth = int(req.get('max_depth', 4))
    samples = int(req.get('samples_per_src', 30000))
    los = bool(req.get('los', True))
    specular = bool(req.get('specular_reflection', True))
    diffuse = bool(req.get('diffuse_reflection', False))
    refraction = bool(req.get('refraction', True))
    seed = int(req.get('seed', 10))
    frequency = float(req.get('frequency', 28e9))

    scene = load_scene(str(REFERENCE_XML))
    scene.frequency = frequency
    scene.tx_array = PlanarArray(num_rows=1, num_cols=1, vertical_spacing=0.5, horizontal_spacing=0.5, pattern='iso', polarization='V')
    scene.rx_array = PlanarArray(num_rows=1, num_cols=1, vertical_spacing=0.5, horizontal_spacing=0.5, pattern='iso', polarization='V')
    scene.add(Transmitter(name='tx_rt', position=tuple(map(float, tx))))
    scene.add(Receiver(name='rx_rt', position=tuple(map(float, rx))))

    paths = PathSolver()(scene,
                         max_depth=max_depth,
                         samples_per_src=samples,
                         los=los,
                         specular_reflection=specular,
                         diffuse_reflection=diffuse,
                         refraction=refraction,
                         synthetic_array=False,
                         seed=seed)

    valid = np.array(paths.valid).squeeze()
    inter = np.array(paths.interactions).squeeze()
    verts = np.array(paths.vertices).squeeze()
    a0 = np.array(paths.a[0]).squeeze()
    a1 = np.array(paths.a[1]).squeeze()

    if valid.ndim == 0:
        valid = valid[None]
    if inter.ndim == 1:
        inter = inter[:, None]
    if verts.ndim == 2:
        verts = verts[:, None, :]
    if a0.ndim == 0:
        a0 = a0[None]
    if a1.ndim == 0:
        a1 = a1[None]

    num_paths = valid.shape[-1]
    powers_db = []
    raw = []

    for p in range(num_paths):
        if not bool(valid[p]):
            continue
        ip = inter[:, p]
        plin = float(a0[p]*a0[p] + a1[p]*a1[p]) + 1e-30
        pdb = 10.0*np.log10(plin)
        powers_db.append(pdb)

        is_los = bool(np.all(ip == InteractionType.NONE))
        is_refl = bool(np.any(ip == InteractionType.SPECULAR))
        ptype = 'LOS' if is_los else ('REFL' if is_refl else 'OTHER')

        poly = [list(map(float, tx))]
        for d in range(max_depth):
            if ip[d] != InteractionType.NONE:
                v = verts[d, p].tolist()
                poly.append([float(v[0]), float(v[1]), float(v[2])])
        poly.append(list(map(float, rx)))
        raw.append({'type': ptype, 'polyline': poly, 'path_power_db': float(pdb)})

    if len(powers_db) == 0:
        out = {'ok': True, 'tx': tx, 'rx': rx, 'frequency_hz': frequency, 'valid_paths': 0, 'los_paths': 0, 'paths': []}
        print(json.dumps(out))
        return

    p5 = float(np.percentile(powers_db, 5))
    p95 = float(np.percentile(powers_db, 95))
    if p95 <= p5:
        p95 = p5 + 1.0

    los_count = 0
    final = []
    for r in raw:
        if r['type'] == 'LOS':
            los_count += 1
        n = float(np.clip((r['path_power_db'] - p5)/(p95 - p5), 0.0, 1.0))
        r['path_power_norm'] = n
        final.append(r)

    out = {
        'ok': True,
        'tx': list(map(float, tx)),
        'rx': list(map(float, rx)),
        'frequency_hz': float(frequency),
        'valid_paths': len(final),
        'los_paths': int(los_count),
        'path_power': {'p5_db': p5, 'p95_db': p95},
        'paths': final
    }
    print(json.dumps(out))

if __name__ == '__main__':
    main()
