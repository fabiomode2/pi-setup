#!/usr/bin/env bash
# Aplica los diffs de patches/ sobre los paquetes npm instalados.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

for diff_file in "$HERE"/patches/*.diff; do
  name=$(basename "$diff_file")
  target=$(grep -m1 '^--- a/' "$diff_file" | sed 's|^--- a/||')
  target_path="$AGENT_DIR/$target"
  if [ ! -f "$target_path" ]; then
    echo "  · $name: no está instalado ($target)"
    continue
  fi
  if patch -p1 --dry-run -d "$AGENT_DIR" < "$diff_file" >/dev/null 2>&1; then
    if [ "$APPLY" = "1" ]; then
      patch -p1 -d "$AGENT_DIR" < "$diff_file" >/dev/null && echo "  ✓ aplicado: $name"
    else
      echo "  · aplicable: $name"
    fi
  else
    echo "  · $name: ya aplicado o versión distinta"
  fi
done

[ "$APPLY" = "0" ] && echo "  (dry run; usa --apply para aplicar)"
