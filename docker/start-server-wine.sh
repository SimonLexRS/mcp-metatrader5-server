#!/bin/bash
# Start script for Wine-based MT5 MCP Server
# Starts Xvfb (virtual display), Wine, and Node.js server

set -e

echo "=========================================="
echo "Starting MT5 MCP Server (Wine Mode)"
echo "=========================================="

# Start Xvfb (virtual X server for headless operation)
echo "Starting Xvfb virtual display..."
Xvfb :99 -screen 0 1024x768x24 &
XVFB_PID=$!
sleep 2

# Initialize Wine if needed
if [ ! -d "$WINEPREFIX" ]; then
    echo "Wine prefix not found. Initializing..."
    wineboot -i
    sleep 5
fi

# Check if MT5 is installed
MT5_INSTALLED=false
if [ -n "$MT5_PATH" ]; then
    # Convert Windows path to Unix path for checking
    UNIX_PATH=$(echo "$MT5_PATH" | sed "s|C:|$WINEPREFIX/drive_c|" | sed 's|\\|/|g')
    if [ -f "$UNIX_PATH" ]; then
        MT5_INSTALLED=true
        echo "✓ MT5 found at: $MT5_PATH"
    fi
fi

if [ "$MT5_INSTALLED" = false ]; then
    echo "⚠ MT5 not found. Installation may be required."
    echo "  Set MT5_PATH in environment or run setup-wine-mt5.sh"
    echo "  Server will start but MT5 tools will fail until configured."
fi

# Start Wine server
echo "Starting Wine server..."
wineserver -p
sleep 2

# Display configuration
echo "=========================================="
echo "Configuration:"
echo "  Wine Prefix: $WINEPREFIX"
echo "  Display: $DISPLAY"
echo "  MT5 Path: ${MT5_PATH:-Not set}"
echo "  Node Port: ${NODE_PORT:-8080}"
echo "  Bridge Mode: ${MT5_BRIDGE_URL:+remote}${MT5_BRIDGE_URL:-local}"
echo "=========================================="

# Change to node-server directory
cd /app/node-server

# Start Node.js server
echo "Starting Node.js HTTP server..."
exec node src/server.js

# Cleanup on exit (this won't run due to exec, but kept for reference)
trap "kill $XVFB_PID 2>/dev/null || true; wineserver -k" EXIT
