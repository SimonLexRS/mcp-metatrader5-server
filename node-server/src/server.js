import { createServer } from "http";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";
import path from "path";

// Auto-detect bridge mode based on MT5_BRIDGE_URL environment variable
const useBridgeRemote = Boolean(process.env.MT5_BRIDGE_URL);
let runTool, checkBridgeHealth;

if (useBridgeRemote) {
  console.log("[mt5-node] Using remote Windows MT5 bridge mode");
  const remoteBridge = await import("./mt5BridgeRemote.js");
  runTool = remoteBridge.runTool;
  checkBridgeHealth = remoteBridge.checkBridgeHealth;
} else {
  console.log("[mt5-node] Using local Python bridge mode");
  const localBridge = await import("./mt5Bridge.js");
  runTool = localBridge.runTool;
  checkBridgeHealth = null; // Not available in local mode
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }
    const idx = line.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const PORT = Number(process.env.NODE_PORT || 8080);
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const requireAuth = Boolean(AUTH_TOKEN);

if (!process.env.MT5_PATH) {
  console.warn(
    "[mt5-node] Warning: MT5_PATH is not set. Provide a path to the MetaTrader 5 terminal in your .env file."
  );
}

function jsonResponse(res, statusCode, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const limit = 1024 * 1024;

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(parsed);
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", (error) => reject(error));
  });
}

function matchToolPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "v1" || parts[1] !== "tools") {
    return null;
  }
  if (parts.length === 3) {
    return { name: parts[2], stream: false };
  }
  if (parts.length === 4 && parts[3] === "stream") {
    return { name: parts[2], stream: true };
  }
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/health") {
    jsonResponse(res, 200, {
      status: "ok",
      requireAuth,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
    });
    return;
  }

  if (req.method === "GET" && pathname === "/health/detailed") {
    try {
      // If using remote bridge, check its health first
      if (useBridgeRemote && checkBridgeHealth) {
        const bridgeHealth = await checkBridgeHealth();
        if (!bridgeHealth.available) {
          jsonResponse(res, 503, {
            status: "degraded",
            healthy: false,
            requireAuth,
            uptimeSeconds: Math.floor(process.uptime()),
            timestamp: new Date().toISOString(),
            nodeVersion: process.version,
            platform: process.platform,
            bridgeMode: "remote",
            bridgeUrl: process.env.MT5_BRIDGE_URL,
            mt5: {
              available: false,
              error: bridgeHealth.error || "Bridge not available",
            },
          });
          return;
        }
      }

      const version = await runTool({ tool: "get_version", params: {} });
      jsonResponse(res, 200, {
        status: "ok",
        healthy: true,
        requireAuth,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
        bridgeMode: useBridgeRemote ? "remote" : "local",
        bridgeUrl: useBridgeRemote ? process.env.MT5_BRIDGE_URL : undefined,
        mt5: {
          available: true,
          version: version,
        },
      });
    } catch (error) {
      jsonResponse(res, 503, {
        status: "degraded",
        healthy: false,
        requireAuth,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
        bridgeMode: useBridgeRemote ? "remote" : "local",
        bridgeUrl: useBridgeRemote ? process.env.MT5_BRIDGE_URL : undefined,
        mt5: {
          available: false,
          error: error.message,
        },
      });
    }
    return;
  }

  if (!requireAuth) {
    jsonResponse(res, 500, {
      ok: false,
      error: "Server authentication is not configured. Set AUTH_TOKEN in the environment.",
    });
    return;
  }

  const provided = req.headers["auth"];
  if (!provided || provided !== AUTH_TOKEN) {
    jsonResponse(res, 401, { ok: false, error: "Unauthorized" });
    return;
  }

  const toolRoute = matchToolPath(pathname);
  if (req.method !== "POST" || !toolRoute) {
    jsonResponse(res, 404, { ok: false, error: "Not Found" });
    return;
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bad Request";
    jsonResponse(res, 400, { ok: false, error: message });
    return;
  }

  function normalizeParams(input) {
    if (input == null) {
      return {};
    }
    if (typeof input !== "object" || Array.isArray(input)) {
      throw new Error("params must be an object");
    }
    return input;
  }

  let params;
  try {
    params = normalizeParams(body?.params);
  } catch (error) {
    jsonResponse(res, 400, { ok: false, error: error.message });
    return;
  }

  if (!toolRoute.stream) {
    try {
      const result = await runTool({ tool: toolRoute.name, params });
      jsonResponse(res, 200, { ok: true, result });
    } catch (error) {
      console.error(`[mt5-node] ${toolRoute.name} failed: ${error.message}`);
      jsonResponse(res, 502, {
        ok: false,
        error: error.message,
        details: error.details,
      });
    }
    return;
  }

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (payload) => {
    res.write(`${JSON.stringify(payload)}\n`);
  };

  send({
    event: "start",
    tool: toolRoute.name,
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await runTool({
      tool: toolRoute.name,
      params,
      signal: controller.signal,
    });
    send({ event: "result", data: result });
    send({ event: "end" });
  } catch (error) {
    console.error(`[mt5-node] stream ${toolRoute.name} failed: ${error.message}`);
    const bodyPayload = { event: "error", message: error.message };
    if (error.details) {
      bodyPayload.details = error.details;
    }
    send(bodyPayload);
  } finally {
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`[mt5-node] Listening on port ${PORT}`);
});

process.on("unhandledRejection", (reason) => {
  console.error("[mt5-node] Unhandled rejection:", reason);
});
