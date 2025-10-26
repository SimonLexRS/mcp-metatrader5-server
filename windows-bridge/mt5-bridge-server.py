#!/usr/bin/env python3
"""
MetaTrader 5 Bridge Server for Windows

This server runs on Windows and exposes MT5 functionality via HTTP.
The Linux-based Node.js server can connect to this bridge remotely.

Architecture:
  [Linux Dokploy] -> HTTP -> [Windows Bridge Server] -> MT5 Terminal

Usage:
  1. Install on Windows: pip install -r requirements.txt
  2. Configure .env file with MT5 credentials
  3. Run: python mt5-bridge-server.py
  4. Server will listen on http://0.0.0.0:5555 by default
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
import MetaTrader5 as mt5
from dotenv import load_dotenv
import traceback
from datetime import datetime, date
from decimal import Decimal
import pandas as pd
import numpy as np

# Load environment variables
load_dotenv()

# Configuration
BRIDGE_PORT = int(os.getenv("MT5_BRIDGE_PORT", "5555"))
BRIDGE_HOST = os.getenv("MT5_BRIDGE_HOST", "0.0.0.0")
AUTH_TOKEN = os.getenv("AUTH_TOKEN", "")
MT5_PATH = os.getenv("MT5_PATH", "")
MT5_LOGIN = int(os.getenv("MT5_LOGIN", "0"))
MT5_PASSWORD = os.getenv("MT5_PASSWORD", "")
MT5_SERVER = os.getenv("MT5_SERVER", "")
AUTO_CONNECT = os.getenv("MT5_AUTO_CONNECT", "true").lower() == "true"

# MT5 connection state
mt5_initialized = False


def json_serializer(obj):
    """Custom JSON serializer for MT5 objects"""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    elif isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, pd.DataFrame):
        return obj.to_dict(orient="records")
    elif hasattr(obj, "__dict__"):
        return obj._asdict() if hasattr(obj, "_asdict") else obj.__dict__
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def ensure_mt5_connection():
    """Ensure MT5 is initialized and logged in"""
    global mt5_initialized

    if not AUTO_CONNECT:
        return mt5_initialized

    if not mt5_initialized:
        # Initialize MT5
        if MT5_PATH:
            if not mt5.initialize(MT5_PATH):
                error = mt5.last_error()
                raise Exception(f"MT5 initialize failed: {error}")
        else:
            if not mt5.initialize():
                error = mt5.last_error()
                raise Exception(f"MT5 initialize failed: {error}")

        # Login
        if MT5_LOGIN and MT5_PASSWORD and MT5_SERVER:
            if not mt5.login(MT5_LOGIN, MT5_PASSWORD, MT5_SERVER):
                error = mt5.last_error()
                mt5.shutdown()
                raise Exception(f"MT5 login failed: {error}")

        mt5_initialized = True

    return True


def execute_mt5_tool(tool_name, params):
    """Execute an MT5 tool and return the result"""
    # Import the MCP module
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
    from mcp_mt5 import main as mcp_main

    # Ensure connection
    if AUTO_CONNECT:
        ensure_mt5_connection()

    # Get the tool function
    tool_func = None
    for tool in mcp_main.mcp.list_tools():
        if tool.name == tool_name:
            # Get the actual function
            tool_func = getattr(mcp_main, tool_name, None)
            break

    if not tool_func:
        raise Exception(f"Tool '{tool_name}' not found")

    # Execute the tool
    result = tool_func(**params)

    return result


class BridgeHandler(BaseHTTPRequestHandler):
    """HTTP request handler for the MT5 bridge server"""

    def log_message(self, format, *args):
        """Override to add timestamp to logs"""
        print(f"[{datetime.now().isoformat()}] {format % args}")

    def send_json_response(self, status_code, data):
        """Send a JSON response"""
        response = json.dumps(data, default=json_serializer)
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response.encode("utf-8"))

    def check_auth(self):
        """Check authentication token"""
        if not AUTH_TOKEN:
            return True  # No auth required if token not set

        auth_header = self.headers.get("Authorization")
        if not auth_header:
            return False

        return auth_header == f"Bearer {AUTH_TOKEN}"

    def do_GET(self):
        """Handle GET requests"""
        parsed_path = urlparse(self.path)

        # Health check endpoint
        if parsed_path.path == "/health":
            self.send_json_response(200, {
                "status": "ok",
                "mt5_initialized": mt5_initialized,
                "timestamp": datetime.now().isoformat()
            })
            return

        # Status endpoint
        if parsed_path.path == "/status":
            if not self.check_auth():
                self.send_json_response(401, {"error": "Unauthorized"})
                return

            self.send_json_response(200, {
                "mt5_initialized": mt5_initialized,
                "auto_connect": AUTO_CONNECT,
                "mt5_version": mt5.version() if mt5_initialized else None,
                "terminal_info": mt5.terminal_info()._asdict() if mt5_initialized else None
            })
            return

        self.send_json_response(404, {"error": "Not Found"})

    def do_POST(self):
        """Handle POST requests"""
        parsed_path = urlparse(self.path)

        # Check authentication
        if not self.check_auth():
            self.send_json_response(401, {"error": "Unauthorized"})
            return

        # Execute tool endpoint
        if parsed_path.path == "/execute":
            try:
                # Read request body
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length)
                data = json.loads(body.decode("utf-8"))

                tool_name = data.get("tool")
                params = data.get("params", {})

                if not tool_name:
                    self.send_json_response(400, {"error": "Missing 'tool' parameter"})
                    return

                # Execute the tool
                result = execute_mt5_tool(tool_name, params)

                self.send_json_response(200, {
                    "ok": True,
                    "result": result
                })

            except Exception as e:
                self.log_message(f"Error executing tool: {str(e)}")
                self.log_message(traceback.format_exc())
                self.send_json_response(500, {
                    "ok": False,
                    "error": str(e),
                    "traceback": traceback.format_exc()
                })

            return

        self.send_json_response(404, {"error": "Not Found"})


def main():
    """Start the MT5 bridge server"""
    print(f"=" * 70)
    print(f"MetaTrader 5 Bridge Server")
    print(f"=" * 70)
    print(f"Host: {BRIDGE_HOST}:{BRIDGE_PORT}")
    print(f"Auto-connect: {AUTO_CONNECT}")
    print(f"Auth required: {bool(AUTH_TOKEN)}")
    print(f"MT5 Path: {MT5_PATH or 'Default'}")
    print(f"=" * 70)

    # Initialize MT5 on startup if auto-connect is enabled
    if AUTO_CONNECT:
        try:
            print("Initializing MT5 connection...")
            ensure_mt5_connection()
            print("✓ MT5 connected successfully")
            print(f"  Version: {mt5.version()}")
            terminal_info = mt5.terminal_info()
            print(f"  Terminal: {terminal_info.name}")
            print(f"  Company: {terminal_info.company}")
        except Exception as e:
            print(f"✗ Failed to connect to MT5: {e}")
            print("  Server will start but MT5 tools will fail until connection is established")

    print(f"\nServer running at http://{BRIDGE_HOST}:{BRIDGE_PORT}")
    print("Press Ctrl+C to stop\n")

    # Start HTTP server
    server = HTTPServer((BRIDGE_HOST, BRIDGE_PORT), BridgeHandler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        if mt5_initialized:
            mt5.shutdown()
        server.shutdown()
        print("Server stopped")


if __name__ == "__main__":
    main()
