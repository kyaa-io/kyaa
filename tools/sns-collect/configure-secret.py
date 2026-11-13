"""Supervisor: merge the dedicated key; never print secret values."""
import argparse, json, os, secrets, subprocess
from pathlib import Path
p = argparse.ArgumentParser()
p.add_argument('environment', choices=['dev', 'prod'])
p.add_argument('--execute', action='store_true')
a = p.parse_args()
os.umask(0o077)
def run(*args, input=None):
    return subprocess.check_output(args, input=input, text=True, stderr=subprocess.DEVNULL)
c = json.loads(run('gh', 'variable', 'get', 'AWS_PLATFORM_CONFIG_JSON', '--repo', 'kyaa-io/kyaa', '--env', a.environment))
arn = c['parameters']['RuntimeConfigSecretArn']
if c['environment'] != a.environment or ':secret:byus/' + a.environment + '/' not in arn:
    raise ValueError('ENVIRONMENT_MISMATCH')
keys = c['runtimeSecretKeys']
if 'SNS_INGEST_SECRET' not in keys:
    keys.append('SNS_INGEST_SECRET')
if not a.execute:
    print('Prepared: merge runtime secret and GitHub environment key list; use --execute to apply.')
else:
    value = json.loads(run('aws', 'secretsmanager', 'get-secret-value', '--secret-id', arn, '--query', 'SecretString', '--output', 'text'))
    key = value.setdefault('SNS_INGEST_SECRET', secrets.token_urlsafe(48))
    if not isinstance(key, str) or len(key) < 32:
        raise ValueError("SNS_INGEST_SECRET_INVALID")
    # Keep the key outside the checkout and out of command arguments.
    dest = Path.home() / '.config/kyaa-sns'
    dest.mkdir(mode=0o700, parents=True, exist_ok=True)
    keyfile = dest / (a.environment + '.secret')
    run('aws', 'secretsmanager', 'put-secret-value', '--secret-id', arn, '--secret-string', 'file:///dev/stdin', input=json.dumps(value))
    with os.fdopen(os.open(keyfile, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as stream:
        os.fchmod(stream.fileno(), 0o600)
        stream.write(key)
    run('gh', 'variable', 'set', 'AWS_PLATFORM_CONFIG_JSON', '--repo', 'kyaa-io/kyaa', '--env', a.environment, input=json.dumps(c))
    print('Configured', a.environment, 'secret and key list. Runtime deployment is still required.')
