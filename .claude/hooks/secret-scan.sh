#!/usr/bin/env bash
# Blocks a commit or push that carries a credential.
#
# This repo has leaked a PI_API_KEY once already (scrubbed from history, still
# needs rotating). The wallet seed that signs driver payouts and the JWT secret
# that mints admin sessions live in the same shell history and .env files as
# everything else here, so one careless `git add -A` is all it takes.
#
# Exit 2 blocks the tool call and shows the reason.
set -uo pipefail
REPO="/Users/mac/Denys88888.github.io"

cmd=$(jq -r '.tool_input.command // empty' 2>/dev/null)
case "$cmd" in
  *"git commit"*|*"git push"*) ;;
  *) exit 0 ;;
esac

cd "$REPO" 2>/dev/null || exit 0

# What is actually about to leave the machine: staged work for a commit, plus
# any commits sitting ahead of the tracked branch for a push.
payload=$(git diff --cached 2>/dev/null)
upstream=$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null)
if [ -n "$upstream" ]; then
  payload="$payload
$(git diff "$upstream"..HEAD 2>/dev/null)"
fi
[ -z "${payload// }" ] && exit 0

# Only added lines matter — a diff that REMOVES a secret is the fix, not the leak.
added=$(printf '%s\n' "$payload" | grep '^+' | grep -v '^+++')
[ -z "${added// }" ] && exit 0

hits=""
add_hit() { hits="$hits  - $1"$'\n'; }

# Stellar secret seed (PI_WALLET_SEED): 'S' + 55 base32 chars.
printf '%s\n' "$added" | grep -Eq '\bS[A-Z2-7]{55}\b' \
  && add_hit "Stellar secret seed (PI_WALLET_SEED shape) — this signs driver payouts"

printf '%s\n' "$added" | grep -q 'BEGIN [A-Z ]*PRIVATE KEY' \
  && add_hit "PEM private key block (Firebase service account?)"

# A named secret assigned a long literal. Deliberately narrow: the repo embeds a
# large base64 audio data URI, which must not trip this.
printf '%s\n' "$added" | grep -Eiq '(jwt_secret|api[_-]?key|access[_-]?token|client[_-]?secret|private[_-]?key)[^=:]{0,20}[=:][[:space:]]*["'\''`][A-Za-z0-9_./+-]{20,}' \
  && add_hit "a named secret assigned a long literal value"

if [ -n "$hits" ]; then
  printf 'Refusing: a credential looks like it is about to be committed or pushed.\n\n%s\n' "$hits"
  echo "If this is a false positive, commit with the hook disabled via /hooks."
  exit 2
fi
exit 0
