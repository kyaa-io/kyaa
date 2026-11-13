"""launchd entry: private config, overlap lock, durable logs and local failure notification."""
import datetime, fcntl, json, os, signal, subprocess, sys
from pathlib import Path
os.umask(0o077)
root = Path.home() / '.config/kyaa-sns'
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
out = root / 'runs' / stamp
status = 1
lock = None
try:
    root.mkdir(parents=True, exist_ok=True)
    lock = (root / 'run.lock').open('w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit(0)
    (root / 'status.json').write_text(json.dumps({'run': stamp, 'exitCode': None}))
    out.mkdir(parents=True)
    with (out / 'run.log').open('w') as log:
        try:
            c = json.loads((root / 'config.json').read_text())
            target = c.get('target', 'dev')
            if target not in ('dev', 'prod'):
                raise ValueError('TARGET_INVALID')
            if target == 'prod' and c.get('devVerified') is not True:
                raise ValueError('DEV_VERIFICATION_REQUIRED')
            env = dict(os.environ, SNS_INGEST_ENDPOINT=('https://dev.kyaa.io' if target == 'dev' else 'https://kyaa.io') + '/api/internal/sns-ingest',
                       SNS_INGEST_SECRET=(root / (target + '.secret')).read_text().strip(),
                       SNS_COLLECT_SOURCES=str(root / 'sources.json'), SNS_COLLECT_OUT=str(out))
            proc = subprocess.Popen(['node', str(Path(__file__).with_name('collect.aside.mjs'))], env=env,
                                    stdout=log, stderr=log, start_new_session=True)
            try:
                status = proc.wait(timeout=6600)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
                raise
        except Exception as error:
            # Exception type is safe even when a process had a secret-bearing environment.
            log.write(type(error).__name__ + '\n')
except Exception as error:
    print(type(error).__name__, file=sys.stderr)
try:
    (root / 'status.json').write_text(json.dumps({'run': stamp, 'exitCode': status, 'log': str(out / 'run.log')}))
except OSError:
    print('STATUS_WRITE_FAILED', file=sys.stderr)
if status:
    try:
        subprocess.run(['osascript', '-e', 'display notification "수집 실패: ~/.config/kyaa-sns/status.json 확인" with title "kyaa SNS 수집"'], timeout=10, check=False)
    except (OSError, subprocess.TimeoutExpired):
        print('NOTIFICATION_FAILED', file=sys.stderr)
raise SystemExit(status)
