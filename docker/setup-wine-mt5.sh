#!/bin/bash
# Setup Wine and install MetaTrader 5
# This script configures Wine environment and installs MT5

set -e

echo "=========================================="
echo "Wine MT5 Setup Script"
echo "=========================================="

# Initialize Wine
echo "Initializing Wine..."
wineboot -i 2>/dev/null || true
sleep 5

# Install necessary Windows components
echo "Installing Windows components..."
winetricks -q vcrun2015 corefonts 2>/dev/null || true

# Download MT5 installer if not present
MT5_INSTALLER="/tmp/mt5setup.exe"
if [ ! -f "$MT5_INSTALLER" ]; then
    echo "Downloading MetaTrader 5 installer..."
    wget -O "$MT5_INSTALLER" "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe"
fi

# Install MT5
echo "Installing MetaTrader 5..."
wine "$MT5_INSTALLER" /auto 2>/dev/null || true
sleep 10

# Find MT5 installation path
MT5_PATH=$(find "$WINEPREFIX/drive_c" -name "terminal64.exe" 2>/dev/null | head -n 1)

if [ -z "$MT5_PATH" ]; then
    echo "Warning: MT5 terminal64.exe not found after installation"
    echo "Trying alternative path..."
    MT5_PATH="C:\\Program Files\\MetaTrader 5\\terminal64.exe"
else
    # Convert Unix path to Windows path
    MT5_PATH=$(echo "$MT5_PATH" | sed "s|$WINEPREFIX/drive_c|C:|" | sed 's|/|\\|g')
    echo "MT5 found at: $MT5_PATH"
fi

echo "=========================================="
echo "Wine MT5 Setup Complete"
echo "=========================================="
echo "MT5 Path: $MT5_PATH"
echo ""
echo "Set this in your environment:"
echo "MT5_PATH=$MT5_PATH"
echo "=========================================="

exit 0
