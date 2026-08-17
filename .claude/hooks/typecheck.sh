#!/usr/bin/env bash
# Type-checks the project after a TypeScript edit.
#
# Runs ~6s, so it is wired as an async rewake hook: it costs nothing while the
# code compiles, and only interrupts when it does not.
set -uo pipefail
REPO="/Users/mac/Denys88888.github.io"

f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null)
case "$f" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

cd "$REPO" 2>/dev/null || exit 0

if ! out=$(npx tsc --noEmit -p . 2>&1); then
  echo "tsc reports errors:"
  printf '%s\n' "$out" | head -25
  exit 2
fi
exit 0
