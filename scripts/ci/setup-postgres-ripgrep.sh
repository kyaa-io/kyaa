#!/usr/bin/env bash
# Prepare PostgreSQL and ripgrep for CI without depending on the Ubuntu apt mirrors.
# The hosted runner image already ships PostgreSQL; apt is only a fallback.
set -euo pipefail

pg_bindir=""
if command -v pg_config >/dev/null 2>&1 && [ -x "$(pg_config --bindir)/initdb" ]; then
  pg_bindir="$(pg_config --bindir)"
else
  for candidate in $(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V -r); do
    if [ -x "$candidate/initdb" ]; then pg_bindir="$candidate"; break; fi
  done
fi

if [ -z "$pg_bindir" ]; then
  echo "::warning::No preinstalled PostgreSQL found; falling back to apt"
  for attempt in 1 2 3; do
    if sudo apt-get update && sudo apt-get install -y postgresql; then break; fi
    [ "$attempt" = 3 ] && { echo "::error::PostgreSQL setup failed (no preinstalled server, apt unavailable)"; exit 1; }
    sleep 15
  done
  pg_bindir="$(pg_config --bindir)"
fi
if ! command -v pg_config >/dev/null 2>&1 && [ ! -x "$pg_bindir/pg_config" ]; then
  # The image ships the server without the dev package; later steps only ask pg_config for --bindir and --version.
  pg_release="$("$pg_bindir/postgres" --version | awk '{print $NF}')"
  sudo tee /usr/local/bin/pg_config >/dev/null <<SHIM
#!/bin/sh
case "\$1" in
  --bindir) echo "$pg_bindir" ;;
  --version) echo "PostgreSQL $pg_release" ;;
  *) echo "pg_config shim: unsupported \$1" >&2; exit 1 ;;
esac
SHIM
  sudo chmod 0755 /usr/local/bin/pg_config
fi
echo "$pg_bindir" >> "$GITHUB_PATH"
export PATH="$pg_bindir:$PATH"
echo "PostgreSQL: $("$pg_bindir/postgres" --version) at $pg_bindir"

if ! command -v rg >/dev/null 2>&1; then
  rg_version=14.1.1
  rg_sha256=4cf9f2741e6c465ffdb7c26f38056a59e2a2544b51f7cc128ef28337eeae4d8e
  rg_file="ripgrep-${rg_version}-x86_64-unknown-linux-musl.tar.gz"
  tmp="$(mktemp -d)"
  curl -fsSL --retry 3 -o "$tmp/$rg_file" "https://github.com/BurntSushi/ripgrep/releases/download/${rg_version}/${rg_file}"
  echo "${rg_sha256}  $tmp/$rg_file" | sha256sum -c -
  tar -xzf "$tmp/$rg_file" -C "$tmp"
  sudo install -m 0755 "$tmp/ripgrep-${rg_version}-x86_64-unknown-linux-musl/rg" /usr/local/bin/rg
fi
echo "ripgrep: $(rg --version | head -1)"
