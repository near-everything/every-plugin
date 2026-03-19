#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="e2e/playwright.config.ts"

need_node_version="18.19.0"

version_ge() {
  # Usage: version_ge 18.19.0 18.11.0
  # returns 0 if $1 >= $2
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n 1)" = "$2" ]
}

current_node="node"
current_ver="$($current_node -v 2>/dev/null | sed 's/^v//' || echo "")"

pick_node() {
  if [ -n "${NVM_BIN:-}" ] && [ -x "${NVM_BIN}/node" ]; then
    echo "${NVM_BIN}/node"
    return
  fi

  if [ -d "${HOME}/.nvm/versions/node" ]; then
    local found
    found=$(ls -1 "${HOME}/.nvm/versions/node"/*/bin/node 2>/dev/null | sort -V | tail -n 1 || true)
    if [ -n "$found" ] && [ -x "$found" ]; then
      echo "$found"
      return
    fi
  fi

  echo "node"
}

node_bin="$current_node"
if [ -z "$current_ver" ] || ! version_ge "$current_ver" "$need_node_version"; then
  node_bin="$(pick_node)"
  picked_ver="$($node_bin -v 2>/dev/null | sed 's/^v//' || echo "")"
  if [ -z "$picked_ver" ] || ! version_ge "$picked_ver" "$need_node_version"; then
    echo "Playwright requires Node >= ${need_node_version}." >&2
    echo "Current node: ${current_ver:-unknown}" >&2
    echo "Tried: ${node_bin} (${picked_ver:-unknown})" >&2
    exit 1
  fi
fi

PW_BIN="./node_modules/.bin/playwright"
if [ ! -x "$PW_BIN" ]; then
  echo "Playwright binary not found at $PW_BIN" >&2
  exit 1
fi

exec "$node_bin" "$PW_BIN" "$@" --config="$CONFIG_PATH"
