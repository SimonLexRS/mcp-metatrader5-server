import { request } from "http";
import { URL } from "url";

/**
 * Execute an MCP tool via remote Windows MT5 Bridge Server.
 * This is used when the Node.js server runs on Linux and MT5 runs on Windows.
 *
 * @param {object} options
 * @param {string} options.tool - Name of the MCP tool to call.
 * @param {object} [options.params] - Parameters to pass to the tool.
 * @param {AbortSignal} [options.signal] - Optional signal to abort the request.
 * @returns {Promise<unknown>} - Resolves with the tool response payload.
 */
export function runTool({ tool, params = {}, signal } = {}) {
  if (!tool) {
    return Promise.reject(new Error("Missing tool name"));
  }

  const bridgeUrl = process.env.MT5_BRIDGE_URL || "http://localhost:5555";
  const bridgeToken = process.env.MT5_BRIDGE_TOKEN || process.env.AUTH_TOKEN || "";

  const url = new URL("/execute", bridgeUrl);
  const payload = JSON.stringify({ tool, params });

  return new Promise((resolve, reject) => {
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 30000, // 30 second timeout
    };

    // Add authorization header if token is set
    if (bridgeToken) {
      options.headers["Authorization"] = `Bearer ${bridgeToken}`;
    }

    const req = request(url, options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk.toString();
      });

      res.on("end", () => {
        if (res.statusCode === 401) {
          reject(new Error("Unauthorized: Invalid MT5 bridge token"));
          return;
        }

        if (res.statusCode === 404) {
          reject(new Error("MT5 bridge endpoint not found"));
          return;
        }

        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (error) {
          reject(new Error(`Invalid JSON response from bridge: ${data}`));
          return;
        }

        if (res.statusCode !== 200 || parsed.ok === false) {
          const message = parsed.error || `Bridge returned status ${res.statusCode}`;
          const err = new Error(message);
          if (parsed.details) {
            err.details = parsed.details;
          }
          if (parsed.traceback) {
            err.traceback = parsed.traceback;
          }
          reject(err);
          return;
        }

        resolve(parsed.result);
      });
    });

    req.on("error", (error) => {
      reject(new Error(`Failed to connect to MT5 bridge at ${bridgeUrl}: ${error.message}`));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request to MT5 bridge timed out"));
    });

    // Handle abort signal
    if (signal) {
      if (signal.aborted) {
        req.destroy();
        reject(new Error("Request aborted"));
        return;
      }

      const onAbort = () => {
        req.destroy();
        reject(new Error("Request aborted"));
      };

      signal.addEventListener("abort", onAbort, { once: true });

      req.on("close", () => {
        signal.removeEventListener("abort", onAbort);
      });
    }

    req.write(payload);
    req.end();
  });
}

/**
 * Check if the remote MT5 bridge is available and healthy.
 *
 * @returns {Promise<object>} - Resolves with health status.
 */
export async function checkBridgeHealth() {
  const bridgeUrl = process.env.MT5_BRIDGE_URL || "http://localhost:5555";
  const url = new URL("/health", bridgeUrl);

  return new Promise((resolve, reject) => {
    const req = request(url, { method: "GET", timeout: 5000 }, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk.toString();
      });

      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            available: res.statusCode === 200,
            ...parsed,
          });
        } catch (error) {
          reject(new Error(`Invalid health check response: ${data}`));
        }
      });
    });

    req.on("error", (error) => {
      resolve({
        available: false,
        error: `Failed to connect: ${error.message}`,
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        available: false,
        error: "Health check timed out",
      });
    });

    req.end();
  });
}
