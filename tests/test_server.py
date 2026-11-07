import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
import urllib.request
import urllib.error


class ServerTests(unittest.TestCase):
    def test_local_empty_start_and_api_origin_token_checks(self):
        with tempfile.TemporaryDirectory() as folder:
            process=subprocess.Popen([sys.executable,str(Path(__file__).resolve().parents[1]/'review.py'),'--port','0','--state-dir',folder,'--no-browser'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            try:
                line=process.stdout.readline().strip();self.assertTrue(line.startswith('Fit reviewer:'),line)
                url=line.split('Fit reviewer: ',1)[1]
                with urllib.request.urlopen(url,timeout=5) as response:page=response.read().decode()
                self.assertIn('Load one or more local MagIC directories',page)
                token=json.loads(re.search(r'const localKey=("[^"]+");',page)[1])
                with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(url+'api/fit-review',timeout=5)
                self.assertEqual(error.exception.code,403)
                request=urllib.request.Request(url+'api/fit-review',headers={'X-Review-Key':token})
                with urllib.request.urlopen(request,timeout=5) as response:self.assertEqual(json.load(response)['fits'],[])
                request=urllib.request.Request(url+'api/fit-review',headers={'X-Review-Key':token,'Origin':'https://example.com'})
                with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(request,timeout=5)
                self.assertEqual(error.exception.code,403)
            finally:
                process.terminate();process.communicate(timeout=5)
