import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bridgeScript = path.join(__dirname, "..", "python", "bridge.py");

/**
 * Execute an MCP tool via the Python bridge.
 * @param {object} options
 * @param {string} options.tool - Name of the MCP tool to call.
 * @param {object} [options.params] - Parameters to pass to the tool.
 * @param {AbortSignal} [options.signal] - Optional signal to abort the Python process.
 * @returns {Promise<unknown>} - Resolves with the tool response payload.
 */
export function runTool({ tool, params = {}, signal } = {}) {
  if (!tool) {
    return Promise.reject(new Error("Missing tool name"));
  }

  const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python";
  const payload = JSON.stringify({ tool, params });

  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable, [bridgeScript], {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const handleAbort = () => {
      child.kill("SIGTERM");
    };

    if (signal) {
      if (signal.aborted) {
        handleAbort();
        reject(new Error("Request aborted"));
        return;
      }
      signal.addEventListener("abort", handleAbort, { once: true });
    }

    child.stdin.write(payload);
    child.stdin.end();

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (signal) {
        signal.removeEventListener("abort", handleAbort);
      }

      if (!stdout.trim() && stderr) {
        reject(new Error(stderr.trim()));
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout || "{}");
      } catch (error) {
        const message = stderr ? `${stderr.trim()}` : "Invalid JSON from bridge";
        reject(new Error(message));
        return;
      }

      if (code !== 0 || parsed.ok === false) {
        const message =
          parsed?.error ||
          (stderr ? stderr.trim() : `Bridge process exited with code ${code}`);
        const details = parsed?.details;
        const err = new Error(message);
        if (details) {
          err.details = details;
        }
        reject(err);
        return;
      }

      resolve(parsed.result);
    });
  });
}
