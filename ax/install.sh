#!/bin/bash
# Install ax tool to ~/.local/bin

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/bin"

mkdir -p "$INSTALL_DIR"

# Create wrapper script
cat > "$INSTALL_DIR/ax" << EOF
#!/bin/bash
exec python3 "$SCRIPT_DIR/ax.py" "\$@"
EOF

chmod +x "$INSTALL_DIR/ax"

echo "ax installed to $INSTALL_DIR/ax"
echo "Make sure $INSTALL_DIR is in your PATH"
