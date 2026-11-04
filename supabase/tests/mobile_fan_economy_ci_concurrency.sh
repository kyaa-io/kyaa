#!/usr/bin/env bash
set -euo pipefail
dir="$(dirname "${BASH_SOURCE[0]}")"
bash "$dir/mobile_fan_economy_races.sh"
bash "$dir/mobile_fan_repeating_earning_races.sh"
bash "$dir/mobile_fan_support_races.sh"
