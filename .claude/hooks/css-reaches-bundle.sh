#!/usr/bin/env bash
# Warns when a stylesheet is not imported by anything.
#
# src/styles/globals.css is not imported anywhere, so none of its rules ship.
# That cost a full fix-deploy-retest cycle: --safe-bottom was defined there, so
# `max(var(--safe-bottom), 12px)` referenced an undefined custom property, which
# makes the whole declaration invalid and drops padding-bottom to 0 — strictly
# worse than the value it replaced, with nothing visibly wrong until a phone
# showed the tab bar under the system nav buttons.
#
# Cheap to check, and it catches the mistake at the moment it is made.
set -uo pipefail
REPO="/Users/mac/Denys88888.github.io"

f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null)
case "$f" in
  *.css) ;;
  *) exit 0 ;;
esac

cd "$REPO" 2>/dev/null || exit 0
base=$(basename "$f")

# index.css is the entry sheet main.tsx imports; Tailwind's own layers live there.
[ "$base" = "index.css" ] && exit 0

# Match an actual import, not any mention: this very file is discussed by name
# in comments in src/index.css and src/utils/safeArea.ts, and a plain filename
# grep counted those as proof it was wired up.
if ! grep -rqE "(import|@import)[^;]*['\"][^'\"]*${base//./\\.}['\"]" src 2>/dev/null; then
  printf 'Note: %s is not imported anywhere.\n' "$base"
  echo "Nothing here reaches the bundle — a class or custom property defined in"
  echo "this file will silently do nothing. Global CSS belongs in src/index.css."
  exit 2
fi
exit 0
