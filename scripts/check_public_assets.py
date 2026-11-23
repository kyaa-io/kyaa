"""Check tracked public assets and literal application/CMS URLs against S3."""
import argparse
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote

PUBLIC = "apps/web/public/"
URL = re.compile(r"""(?P<q>["'`])(?P<url>/public-assets/[^"'`\n]+)(?P=q)""")
DENIED = re.compile(r"\(403\)|AccessDenied|Forbidden|Unable to locate credentials|ExpiredToken")


def collect(paths):
    keys = set()
    for path in paths:
        name = path.as_posix()
        if name.startswith(PUBLIC + "public-assets/"):
            keys.add(name[len(PUBLIC):])
            continue
        if not (name.startswith("apps/web/") or "seed" in name.lower() or "cms" in name.lower()):
            continue
        if (path.suffix not in {".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".sql", ".mjs"}
                or re.search(r"/(public|e2e|fixtures?|tests?|__tests__)/|\.(test|spec|fixture)\.", name)):
            continue
        source = path.read_text()
        for match in URL.finditer(source):
            key = unquote(re.split(r"[?#]", match["url"], 1)[0][1:])
            if key.endswith("/") or any(x in key for x in ("${", "*")):
                continue
            # SceneVideo takes an extensionless MP4/WebM pair, inline or stored in data (home banner loops).
            if re.search(r"<SceneVideo\s+src=$", source[:match.start()]) or not Path(key).suffix:
                keys.update(key + ext for ext in (".webm", ".mp4"))
            else:
                keys.add(key)
    return sorted(keys)


def aws(*args):
    return subprocess.run(["aws", *args], capture_output=True, text=True)


def check(bucket, keys, call=aws):
    missing, uncertain = [], []
    for key in keys:
        result = call("s3api", "head-object", "--bucket", bucket, "--key", key)
        if not result.returncode:
            continue
        if re.search(r"\(404\)|NoSuchKey|Not Found", result.stderr):
            missing.append(key)
        elif DENIED.search(result.stderr):
            uncertain.append(key)
        else:
            raise RuntimeError(result.stderr)
    if uncertain:
        print(f"::warning::AWS 읽기 권한 확인 불가 ({bucket}, {len(uncertain)}개)")
    if missing:
        print("누락된 파일 (" + bucket + ")\n" + "\n".join(missing))
    print(f"확인 {len(keys)-len(missing)-len(uncertain)}개, 누락 {len(missing)}개, 확인 불가 {len(uncertain)}개")
    return bool(missing)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    config = json.loads(parser.parse_args().config.read_text())
    result = aws("cloudformation", "describe-stacks", "--stack-name", config["stackName"],
                 "--query", "Stacks[0].Outputs[?OutputKey=='PublicAssetsBucketName'].OutputValue | [0]", "--output", "text")
    if result.returncode and DENIED.search(result.stderr):
        print("::warning::AWS 읽기 권한으로 버킷 확인 불가")
        return 0
    if result.returncode or result.stdout.strip() in {"", "None"}:
        raise RuntimeError(result.stderr or "PublicAssetsBucketName 누락")
    files = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")
    return check(result.stdout.strip(), collect(Path(f) for f in files if f))


if __name__ == "__main__":
    raise SystemExit(main())
