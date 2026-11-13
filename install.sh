#!/usr/bin/env bash
# Instala las extensiones, mezcla los ajustes y (opcional) instala los paquetes.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"

echo "→ agent dir: $AGENT_DIR"
mkdir -p "$AGENT_DIR/extensions"

for file in "$HERE"/extensions/*.ts; do
  name=$(basename "$file")
  if [ -e "$AGENT_DIR/extensions/$name" ]; then
    echo "  · $name ya existe, se guarda copia .bak"
    cp "$AGENT_DIR/extensions/$name" "$AGENT_DIR/extensions/$name.bak"
  fi
  cp "$file" "$AGENT_DIR/extensions/$name"
  echo "  ✓ $name"
done

echo "→ parches de paquetes + repatch"
mkdir -p "$AGENT_DIR/patches" "$AGENT_DIR/bin"
cp "$HERE"/patches/manifest.json "$AGENT_DIR/patches/manifest.json"
cp -r "$HERE"/patches/files "$AGENT_DIR/patches/"
cp "$HERE"/bin/repatch "$AGENT_DIR/bin/repatch" && chmod +x "$AGENT_DIR/bin/repatch"
echo "  ✓ $(python3 -c "import json;print(len(json.load(open('$HERE/patches/manifest.json'))))") parches, bin/repatch"

echo "→ keybindings"
cp "$HERE"/keybindings.json "$AGENT_DIR/keybindings.json" && echo "  ✓ keybindings.json"

echo "→ mezclando settings.example.json"
python3 - "$HERE/settings.example.json" "$AGENT_DIR/settings.json" <<'PY'
import json, os, sys
example_path, target = sys.argv[1], sys.argv[2]
example = json.load(open(example_path))
try:
    current = json.load(open(target))
except Exception:
    current = {}
changed = []
for key, value in example.items():
    if key not in current:
        current[key] = value
        changed.append(key)
if changed:
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w") as fh:
        json.dump(current, fh, indent=2)
        fh.write("\n")
    print("  añadidas:", ", ".join(changed))
else:
    print("  nada que añadir")
PY

echo "→ instalando paquetes"
for pkg in pi-minimalist awesome-pi-themes pi-subagents-lite pi-hermes-memory \
           @underactive/pi-topping-splash @underactive/pi-topping-web-tools; do
  command -v pi >/dev/null && pi install "npm:$pkg" >/dev/null && echo "  ✓ $pkg" || echo "  ! $pkg (instálalo a mano)"
done

echo
echo "Listo. Reinicia Pi."
echo "Opcional: ./apply-patches.sh   (reaplica los parches npm; core-patch.ts se encarga del bundle)"
