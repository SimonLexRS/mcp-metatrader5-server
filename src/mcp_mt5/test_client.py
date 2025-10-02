import asyncio
from fastmcp import Client

client = Client("http://localhost:8000/mcp")

async def call_tool(path: str):
    async with client:
        result = await client.call_tool("initialize", {"path": path})
        print(result)

asyncio.run(call_tool(r"C:\Program Files\RoboForex MT5 Terminal\terminal64.exe"))