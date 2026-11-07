#!/usr/bin/env python3
"""Run a local-only multi-directory MagIC fit reviewer."""
import argparse
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import json
from pathlib import Path
import re
import secrets
import sys
import threading
from urllib.parse import urlsplit
import webbrowser

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'lib'))
from collection import Collection


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory','-d',action='append',default=[],help='MagIC folder; repeat for multiple folders')
    parser.add_argument('--state-dir',type=Path,default=Path.home()/'.local/share/pmag-fit-review')
    parser.add_argument('--port',type=int,default=8770)
    parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args();collection=Collection(args.state_dir);lock=threading.RLock();token=secrets.token_urlsafe(32)
    if args.directory:collection.set_directories(args.directory)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def allowed(self,api=False):
            host=f'127.0.0.1:{self.server.server_port}'
            return (self.headers.get('Host')==host and self.headers.get('Origin','http://'+host)=='http://'+host
                    and (not api or secrets.compare_digest(self.headers.get('X-Review-Key',''),token)))
        def send(self,status,value,kind='application/json'):
            body=value if isinstance(value,bytes) else value.encode() if isinstance(value,str) else json.dumps(value,allow_nan=False).encode()
            self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Cache-Control','no-store');self.send_header('X-Frame-Options','DENY');self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data: blob:; base-uri 'none'; form-action 'none'")
            self.end_headers();self.wfile.write(body)
        def do_GET(self):
            path=urlsplit(self.path).path
            if not self.allowed(path.startswith('/api/')):return self.send(403,{'error':'Local app access only.'})
            try:
                with lock:
                    if path=='/':
                        page=(ROOT/'templates/fit_review.html').read_text().replace('/* SHARED_STYLE */',(ROOT/'templates/shared.css').read_text()).replace('/* LOCAL_KEY */',json.dumps(token)).replace('/* PLOTS */',(ROOT/'templates/quality_review_plots.js').read_text()).replace('/* FIT_APP */',(ROOT/'templates/fit_review.js').read_text())
                        return self.send(200,page,'text/html; charset=utf-8')
                    if path=='/api/fit-review':return self.send(200,collection.bundle())
                    if re.fullmatch('/api/download/[0-9_]+',path):
                        file=collection.state/'exports'/(path.rsplit('/',1)[1]+'.zip')
                        if file.exists():return self.send(200,file.read_bytes(),'application/zip')
            except (ValueError,OSError,KeyError,ImportError) as e:return self.send(400,{'error':str(e)})
            return self.send(404,{'error':'Not found.'})
        def do_POST(self):
            if not self.allowed(True):return self.send(403,{'error':'Local app access only.'})
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=1024*1024:raise ValueError('Invalid request size.')
                value=json.loads(self.rfile.read(size));path=urlsplit(self.path).path
                with lock:
                    if path=='/api/directories':return self.send(200,collection.set_directories(value.get('directories')))
                    if path=='/api/fit-review/choice':return self.send(200,collection.save_choice(value))
                    if path=='/api/fit-review/export':return self.send(200,collection.export_kept())
                return self.send(404,{'error':'Not found.'})
            except (ValueError,OSError,KeyError,ImportError) as e:return self.send(400,{'error':str(e)})
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    url=f'http://127.0.0.1:{server.server_port}/';print('Fit reviewer: '+url,flush=True)
    if not args.no_browser:webbrowser.open(url)
    server.serve_forever()


if __name__=='__main__':main()
