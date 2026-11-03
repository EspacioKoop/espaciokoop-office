import contextlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from hermes_office_profile import bootstrap_profile


class ProfileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='hp-')
        self.home = Path(self.temp.name) / 'profile'
        self.home.mkdir(mode=0o700)
        self.hermes = self.home / 'hermes'
        self.hermes.mkdir(mode=0o700)
        self.hooks = self.hermes / 'hooks'
        self.env = mock.patch.dict(os.environ, HOME=str(self.home), HERMES_HOME=str(self.hermes))
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def test_normal_and_exception(self):
        with bootstrap_profile():
            self.assertEqual(self.hooks.stat().st_mode & 0o777, 0o700)
        self.assertFalse(self.hooks.exists())
        with self.assertRaisesRegex(ValueError, 'fixture'):
            with bootstrap_profile():
                raise ValueError('fixture')
        self.assertFalse(self.hooks.exists())

    def test_preexisting_objects_never_touched(self):
        target = self.hermes / 'target'
        target.mkdir()
        (target / 'guard').write_bytes(b'guard')
        for kind in ('empty', 'contents', 'link', 'dangling', 'file'):
            with self.subTest(kind=kind):
                if kind in ('empty', 'contents'):
                    self.hooks.mkdir()
                    if kind == 'contents':
                        (self.hooks / 'guard').write_bytes(b'fixture')
                elif kind == 'file':
                    self.hooks.write_bytes(b'fixture')
                else:
                    self.hooks.symlink_to(target if kind == 'link' else 'missing')
                before = os.lstat(self.hooks)
                with self.assertRaises(Exception):
                    with bootstrap_profile():
                        self.fail('entered')
                self.assertEqual(os.lstat(self.hooks).st_ino, before.st_ino)
                self.assertEqual((target / 'guard').read_bytes(), b'guard')
                if kind == 'contents':
                    self.assertEqual((self.hooks / 'guard').read_bytes(), b'fixture')
                    (self.hooks / 'guard').unlink()
                if kind == 'file':
                    self.assertEqual(self.hooks.read_bytes(), b'fixture')
                if kind in ('empty', 'contents'):
                    self.hooks.rmdir()
                else:
                    self.hooks.unlink()

    def test_added_content_preserved(self):
        with self.assertRaises(Exception):
            with bootstrap_profile():
                (self.hooks / 'guard').write_bytes(b'keep')
        self.assertEqual((self.hooks / 'guard').read_bytes(), b'keep')

    def test_replacement_and_mode_preserved(self):
        for kind in ('inode', 'mode', 'symlink', 'missing'):
            with self.subTest(kind=kind):
                with self.assertRaises(Exception):
                    with bootstrap_profile():
                        if kind == 'mode':
                            self.hooks.chmod(0o755)
                        else:
                            self.hooks.rename(self.hermes / 'original')
                            if kind == 'inode':
                                self.hooks.mkdir()
                                (self.hooks / 'guard').write_bytes(b'keep')
                            elif kind == 'symlink':
                                self.hooks.symlink_to('original')
                if kind == 'mode':
                    self.assertEqual(self.hooks.stat().st_mode & 0o777, 0o755)
                    self.hooks.rmdir()
                else:
                    self.assertTrue((self.hermes / 'original').is_dir())
                    if kind == 'inode':
                        self.assertEqual((self.hooks / 'guard').read_bytes(), b'keep')
                        (self.hooks / 'guard').unlink(); self.hooks.rmdir()
                    elif kind == 'symlink':
                        self.assertTrue(self.hooks.is_symlink()); self.hooks.unlink()
                    (self.hermes / 'original').rmdir()

    def test_home_replaced(self):
        old = self.home.with_name('old')
        with self.assertRaises(Exception):
            with bootstrap_profile():
                self.home.rename(old)
                self.home.mkdir(mode=0o700)
                self.hermes.mkdir(mode=0o700)
                self.hooks.mkdir(mode=0o700)
                (self.hooks / 'guard').write_bytes(b'keep')
        self.assertEqual((self.hooks / 'guard').read_bytes(), b'keep')
        self.assertTrue((old / 'hermes' / 'hooks').is_dir())

    def test_no_ready_before_failed_cleanup(self):
        tools = Path(__file__).resolve().parents[1] / 'tools'
        script = """import os, runpy, sys, types
p=types.ModuleType('hermes_cli'); p.__path__=[]; sys.modules['hermes_cli']=p
r=types.ModuleType('hermes_cli.runtime_provider'); r.resolve_runtime_provider=lambda **k: dict(provider='openai-codex', api_mode='codex_responses', api_key='fixture', base_url='https://invalid'); sys.modules[r.__name__]=r
m=types.ModuleType('run_agent')
class Agent:
 def __init__(self, **k):
  self.provider=k['provider']; self.api_mode=k['api_mode']; self.model=k['model']; self._fallback_chain=[]
  open(os.path.join(os.environ['HERMES_HOME'],'hooks','guard'),'wb').write(b'keep')
 def run_conversation(self, text): pass
m.AIAgent=Agent; sys.modules['run_agent']=m
sys.argv=['bridge','--model','fixture','--check-runtime']
runpy.run_path(sys.argv_path, run_name='__main__')
"""
        script = 'import sys\nsys.path.insert(0,' + repr(str(tools)) + ')\nsys.argv_path=' + repr(str(tools / 'hermes-office-local.py')) + '\n' + script
        r = subprocess.run([sys.executable, '-c', script], capture_output=True, text=True, env=os.environ.copy())
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(len(r.stdout.splitlines()), 1)
        self.assertFalse(json.loads(r.stdout)['ready'])
        self.assertEqual(r.stderr, '')
        self.assertEqual((self.hooks / 'guard').read_bytes(), b'keep')


if __name__ == '__main__':
    unittest.main()
