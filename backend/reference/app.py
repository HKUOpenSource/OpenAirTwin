#!/usr/bin/env python3
import json, re, subprocess
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, unquote

# Resolve all paths relative to this app.py file so deployment is portable
ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parent
STATIC = ROOT / 'static'

# Prefer local workspace paths; fallback to legacy absolute deployment paths
DATA_JSON = WORKSPACE / 'precomputed_paths.json'
HKU_XML = WORKSPACE / 'HKU.xml'
MESH_ROOT = WORKSPACE / 'meshes'
if not DATA_JSON.exists():
    DATA_JSON = Path('/home/defaultuser/hku_demo/offline_demo/precomputed_paths.json')
if not HKU_XML.exists():
    HKU_XML = Path('/home/defaultuser/hku_demo/HKU.xml')
if not MESH_ROOT.exists():
    MESH_ROOT = Path('/home/defaultuser/hku_demo/meshes')

SOLVE_PAIR = ROOT / 'solve_pair.py'
PY_BIN = Path('/home/defaultuser/venvs/sionna-gpu/bin/python')
if not PY_BIN.exists():
    PY_BIN = Path('python3')

def ctype_for(p: Path):
    s = p.suffix.lower()
    return {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg'
    }.get(s, 'application/octet-stream')

def build_manifest():
    if not HKU_XML.exists():
        return {'count': 0, 'meshes': []}

    xml = HKU_XML.read_text(encoding='utf-8', errors='replace')
    files = re.findall(r'<string\s+name="filename"\s+value="([^"]+)"', xml)
    uniq, seen = [], set()
    for f in files:
        if not f.startswith('meshes/'):
            continue
        name = f.split('/', 1)[1]
        if name in seen:
            continue
        seen.add(name)
        color = '#4f5256' if '-itu_marble' in name else ('#6b4a3f' if '-itu_brick' in name else '#808080')
        uniq.append({'file': name, 'color': color})
    return {'count': len(uniq), 'meshes': uniq}

MANIFEST = build_manifest()

class H(BaseHTTPRequestHandler):
    def sendb(self, b, code=200, ctype='application/json; charset=utf-8'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(b)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(b)

    def do_POST(self):
        p = urlparse(self.path).path
        if p != '/api/solve_pair':
            return self.sendb(b'Not Found', 404, 'text/plain; charset=utf-8')

        try:
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length) if length > 0 else b'{}'
            req = json.loads(raw.decode('utf-8'))

            if not SOLVE_PAIR.exists():
                return self.sendb(b'{"ok":false,"error":"solve_pair.py not found"}', 500)

            cp = subprocess.run(
                [str(PY_BIN), str(SOLVE_PAIR)],
                input=json.dumps(req),
                text=True,
                capture_output=True,
                timeout=120
            )
            if cp.returncode != 0:
                msg = {'ok': False, 'error': cp.stderr.strip()[:8000] or 'solver failed'}
                return self.sendb(json.dumps(msg).encode('utf-8'), 500)

            return self.sendb(cp.stdout.encode('utf-8'))
        except subprocess.TimeoutExpired:
            return self.sendb(b'{"ok":false,"error":"solver timeout"}', 504)
        except Exception as e:
            return self.sendb(json.dumps({'ok': False, 'error': str(e)}).encode('utf-8'), 500)

    def do_GET(self):
        p = urlparse(self.path).path

        if p in ('/', '/index.html', '/realtime.html'):
            name = 'index.html' if p in ('/', '/index.html') else 'realtime.html'
            fp = STATIC / name
            if not fp.exists():
                return self.sendb(b'index.html not found', 500, 'text/plain; charset=utf-8')
            return self.sendb(fp.read_bytes(), ctype=ctype_for(fp))

        if p.startswith('/lib/') or p.startswith('/assets/'):
            fp = (STATIC / p[1:]).resolve()
            if fp.exists() and str(fp).startswith(str(STATIC.resolve())):
                return self.sendb(fp.read_bytes(), ctype=ctype_for(fp))
            return self.sendb(b'Not Found', 404, 'text/plain; charset=utf-8')

        if p == '/api/data':
            if not DATA_JSON.exists():
                return self.sendb(b'precomputed_paths.json not found', 500, 'text/plain; charset=utf-8')
            return self.sendb(DATA_JSON.read_bytes())

        if p == '/api/manifest':
            return self.sendb(json.dumps(MANIFEST).encode('utf-8'))

        if p.startswith('/meshes/'):
            rel = unquote(p[len('/meshes/'):])
            fp = (MESH_ROOT / rel).resolve()
            if not str(fp).startswith(str(MESH_ROOT.resolve())) or not fp.exists():
                return self.sendb(b'Not Found', 404, 'text/plain; charset=utf-8')
            return self.sendb(fp.read_bytes(), ctype='application/octet-stream')

        return self.sendb(b'Not Found', 404, 'text/plain; charset=utf-8')

if __name__ == '__main__':
    print(f'Serving from: {ROOT}')
    print('Open: http://0.0.0.0:8090')
    ThreadingHTTPServer(('0.0.0.0', 8090), H).serve_forever()
