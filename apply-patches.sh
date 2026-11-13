#!/usr/bin/env bash
# Reaplica los parches de paquetes npm desde patches/manifest.json.
# Los parches del bundle de Pi los gestiona solo la extensión core-patch.ts.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"

mkdir -p "$AGENT_DIR/patches" "$AGENT_DIR/bin"
cp "$HERE"/patches/manifest.json "$AGENT_DIR/patches/manifest.json"
cp -r "$HERE"/patches/files "$AGENT_DIR/patches/"
install -m 755 "$HERE"/bin/repatch "$AGENT_DIR/bin/repatch"

diffs=0
for f in "$AGENT_DIR"/patches/files/*; do
  name=$(basename "$f")
  target=$(python3 - "$AGENT_DIR/patches/manifest.json" "$name" <<'PY'
import json, sys
manifest_path, stored = sys.argv[1], sys.argv[2]
for entry in json.load(open(manifest_path)):
    if entry["stored"] == stored:
        print(entry["target"]); break
PY
)
  if [ -n "${target:-}" ] && cmp -s "$f" "$AGENT_DIR/$target"; then
    echo "  = $name"
  else
    diffs=$((diffs + 1))
  fi
done

"$AGENT_DIR/bin/repatch"
echo "Reinicia Pi si hubo cambios."
