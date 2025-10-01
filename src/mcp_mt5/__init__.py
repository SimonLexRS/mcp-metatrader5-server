from .main import mcp
import os

mcp.run(transport="http", host=os.getenv("MT5_MCP_HOST", "127.0.0.1"), port=int(os.getenv("MT5_MCP_PORT", 8000)))