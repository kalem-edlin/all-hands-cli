#!/bin/bash
# Install the ah shim to ~/.local/bin
# Run this during local development to set up the ah command

set -e

SHIM_DIR="$HOME/.local/bin"
SHIM_PATH="$SHIM_DIR/ah"

mkdir -p "$SHIM_DIR"

cat > "$SHIM_PATH" << 'EOF'
#!/bin/bash
# AllHands CLI shim - finds and executes project-local .allhands/ah
# Installed by: npx all-hands init

dir="$PWD"
while [ "$dir" != "/" ]; do
  if [ -x "$dir/.allhands/ah" ]; then
    exec "$dir/.allhands/ah" "$@"
  fi
  dir="$(dirname "$dir")"
done

echo "error: not in an all-hands project (no .allhands/ah found)" >&2
echo "hint: run 'npx all-hands init .' to initialize this project" >&2
exit 1
EOF

chmod +x "$SHIM_PATH"

echo "Installed: $SHIM_PATH"

# Check if in PATH
if [[ ":$PATH:" != *":$SHIM_DIR:"* ]]; then
  echo ""
  echo "⚠️  $SHIM_DIR is not in your PATH"
  echo "Add this to your ~/.zshrc or ~/.bashrc:"
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi
