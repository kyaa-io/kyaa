#!/usr/bin/env bash
set -euo pipefail
exec "${BYUS_PORTABILITY_NODE:-node}" "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/portability-rehearsal.mjs"
