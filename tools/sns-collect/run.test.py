import fcntl, json, os, subprocess, tempfile, unittest
from pathlib import Path
SCRIPT = Path(__file__).with_name('run.py').resolve()
class RunnerTest(unittest.TestCase):
    def test_target_failure_and_overlap(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp); root = home / '.config/kyaa-sns'; root.mkdir(parents=True)
            bin = home / 'bin'; bin.mkdir()
            for name, body in [('node', '#!/bin/sh\ntouch "$HOME/node-ran"\nprintf "%s" "$SNS_INGEST_ENDPOINT" > "$HOME/endpoint"\nexit "${TEST_EXIT:-0}"\n'), ('osascript', '#!/bin/sh\ntouch "$HOME/notified"\n')]:
                p = bin / name; p.write_text(body); p.chmod(0o700)
            for target in ['dev', 'prod']: (root / (target + '.secret')).write_text('private-test-key-' + target)
            env = dict(os.environ, HOME=tmp, PATH=str(bin) + ':' + os.environ['PATH'])
            def run(config, **extra):
                (root / 'config.json').write_text(json.dumps(config))
                return subprocess.run(['/usr/bin/python3', str(SCRIPT)], env=dict(env, **extra)).returncode
            for verified in [False, 'false']:
                self.assertNotEqual(run({'target':'prod','devVerified':verified}), 0)
                self.assertFalse((home/'node-ran').exists())
                state=json.loads((root/'status.json').read_text())
                self.assertNotEqual(state['exitCode'], 0)
                self.assertIn('ValueError', Path(state['log']).read_text())
            self.assertEqual(run({'target':'prod','devVerified':True}), 0)
            self.assertEqual((home/'endpoint').read_text(), 'https://kyaa.io/api/internal/sns-ingest')
            (home/'notified').unlink()
            self.assertNotEqual(run({'target':'dev'}, TEST_EXIT='7'), 0)
            self.assertTrue((home/'notified').exists())
            for log in (root/'runs').glob('*/run.log'): self.assertNotIn('private-test-key', log.read_text())
            count=len(list((root/'runs').iterdir()))
            with (root/'run.lock').open('w') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                self.assertEqual(run({'target':'dev'}), 0)
            self.assertEqual(len(list((root/'runs').iterdir())),count)
if __name__ == '__main__': unittest.main()
