#!/usr/bin/env bash
set -euo pipefail
python3 "$(dirname "${BASH_SOURCE[0]}")/mobile_fan_upper_rpc_races.py"
python3 "$(dirname "${BASH_SOURCE[0]}")/mobile_fan_activation_races.py"
python3 "$(dirname "${BASH_SOURCE[0]}")/mobile_fan_economy_races.py"
