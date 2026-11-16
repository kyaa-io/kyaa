"""launchd entry: private config, overlap lock, durable logs and local failure notification."""
import datetime, fcntl, json, os, signal, subprocess, sys, urllib.request
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
            # 'targets' (e.g. ["dev","prod"]) sends one collection to each; legacy 'target' still works.
            targets = c.get('targets') or [c.get('target', 'dev')]
            if not targets or len(targets) > 2 or len(set(targets)) != len(targets) or any(x not in ('dev', 'prod') for x in targets):
                raise ValueError('TARGET_INVALID')
            if 'prod' in targets and c.get('devVerified') is not True:
                raise ValueError('DEV_VERIFICATION_REQUIRED')
            host = lambda x: ('https://dev.kyaa.io' if x == 'dev' else 'https://kyaa.io') + '/api/internal/sns-ingest'
            env = dict(os.environ, SNS_INGEST_ENDPOINT=host(targets[0]),
                       SNS_INGEST_SECRET=(root / (targets[0] + '.secret')).read_text().strip(),
                       SNS_COLLECT_SOURCES=str(root / 'sources.json'), SNS_COLLECT_OUT=str(out))
            if len(targets) == 2:
                env.update(SNS_INGEST_ENDPOINT_2=host(targets[1]), SNS_INGEST_SECRET_2=(root / (targets[1] + '.secret')).read_text().strip())
            # The existing two-hour launchd entry checks the weekly collectors without a new scheduler, per target.
            week_old = lambda f: not f.exists() or (datetime.datetime.now(datetime.timezone.utc).timestamp() - f.stat().st_mtime) >= 7 * 86400
            # Instagram/TikTok follower counts come from the profile pages this run reads anyway; node sends them and touches the stamp on success.
            for i, t in enumerate(targets):
                followers = root / ('platform-followers-' + t + '.last-success')
                if week_old(followers):
                    env['SNS_FOLLOWERS_STAMP' + ('_2' if i else '')] = str(followers)
            # Platforms with an official server-side API (YouTube Data API, CHZZK Open API): the server reads them, this only calls weekly.
            for name in ('youtube', 'chzzk'):
                for t in targets:
                    weekly = root / (name + '-followers-' + t + '.last-success')
                    if not week_old(weekly):
                        continue
                    try:
                        req = urllib.request.Request(host(t).replace('/api/internal/sns-ingest', '/api/internal/' + name + '-followers'),
                            data=b'{}', method='POST', headers={'Authorization': 'Bearer ' + (root / (t + '.secret')).read_text().strip(), 'Content-Type': 'application/json'})
                        with urllib.request.urlopen(req, timeout=290) as response:
                            if response.status != 200: raise ValueError(name.upper() + '_COLLECT_FAILED')
                        weekly.touch()
                        log.write(name.upper() + '_FOLLOWERS_OK ' + t + '\n')
                    except Exception as error:
                        log.write(name.upper() + '_COLLECT_' + t + '_' + type(error).__name__ + '\n')
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
