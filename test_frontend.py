import http.client
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class FrontendTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        assets = self.root / 'dist' / 'assets'
        assets.mkdir(parents=True)
        (self.root / 'dist' / 'index.html').write_text('<html>dashboard</html>')
        (assets / 'app-hash.js').write_text('console.log("loaded")')
        (self.root / 'secret.txt').write_text('private')
        self.httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.port = self.httpd.server_port
        self.root_patch = patch.object(server, 'ROOT', self.root)
        self.port_patch = patch.object(server, 'PORT', self.port)
        self.root_patch.start()
        self.port_patch.start()
        self.thread = threading.Thread(target=self.httpd.serve_forever)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.thread.join()
        self.httpd.server_close()
        self.port_patch.stop()
        self.root_patch.stop()
        self.directory.cleanup()

    def request(self, path, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port)
        connection.request('GET', path, headers=headers or {})
        response = connection.getresponse()
        result = response.status, response.getheader('Content-Type'), response.read()
        connection.close()
        return result

    def test_serves_build_entry_and_hashed_asset(self):
        self.assertEqual(self.request('/')[0], 200)
        status, content, body = self.request('/assets/app-hash.js')
        self.assertEqual(status, 200)
        self.assertIn('javascript', content)
        self.assertIn(b'loaded', body)

    def test_rejects_paths_outside_build_and_foreign_hosts(self):
        self.assertEqual(self.request('/../secret.txt')[0], 404)
        self.assertEqual(self.request('/%2e%2e/secret.txt')[0], 404)
        self.assertEqual(self.request('/', {'Host': 'foreign.example'})[0], 403)
        (self.root / 'dist' / 'linked.txt').symlink_to(self.root / 'secret.txt')
        self.assertEqual(self.request('/linked.txt')[0], 404)

    def test_missing_build_returns_actionable_error(self):
        (self.root / 'dist' / 'index.html').unlink()
        status, _, body = self.request('/')
        self.assertEqual(status, 404)
        self.assertIn(b'pnpm build', body)
