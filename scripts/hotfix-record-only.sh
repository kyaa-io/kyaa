#!/bin/bash
# Success only for the harness's single record push on main.
set -eu
[[ ${GITHUB_EVENT_NAME:-} == push && ${GITHUB_REF:-} == refs/heads/main ]]
read -r first candidate extra <<< "$(git show -s --format=%P "$GITHUB_SHA")"
[[ -z "$extra" && "$first" == "$PUSH_BEFORE" && "$candidate" =~ ^[a-f0-9]{40}$ ]]
subject=$(git show -s --format=%s "$GITHUB_SHA")
[[ "$subject" == "Record approved production hotfix $candidate" || "$subject" == "Record production hotfix $candidate" ]]
git diff --quiet "$first" "$GITHUB_SHA" -- . ':(exclude)release-notes/**'
