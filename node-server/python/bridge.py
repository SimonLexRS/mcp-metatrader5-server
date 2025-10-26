"""Bridge script to expose MetaTrader 5 MCP tools for the Node.js HTTP wrapper."""

from __future__ import annotations

import json
import os
import sys
import traceback
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

if load_dotenv:
    load_dotenv()

try:
    import pandas as pd  # type: ignore
except ImportError:  # pragma: no cover
    pd = None  # type: ignore

try:
    import numpy as np  # type: ignore
except ImportError:  # pragma: no cover
    np = None  # type: ignore

from mcp_mt5 import main as mt5_main


def is_truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() not in {"0", "false", "no", "off", ""}


def ensure_connection() -> None:
    auto_connect = is_truthy(os.getenv("MT5_AUTO_CONNECT", "true"))
    if not auto_connect:
        return

    mt5_path = os.getenv("MT5_PATH")
    if mt5_path:
        if not mt5_main.initialize(path=mt5_path):
            raise RuntimeError(
                "MetaTrader initialization failed. "
                "Verify MT5_PATH points to terminal64.exe."
            )

    mt5_login = os.getenv("MT5_LOGIN")
    mt5_password = os.getenv("MT5_PASSWORD")
    mt5_server = os.getenv("MT5_SERVER")

    if mt5_login and mt5_password and mt5_server:
        try:
            login_number = int(mt5_login)
        except ValueError as exc:
            raise ValueError("MT5_LOGIN must be an integer.") from exc

        if not mt5_main.login(
            login=login_number, password=mt5_password, server=mt5_server
        ):
            raise RuntimeError(
                "MetaTrader login failed. Check MT5_LOGIN/MT5_PASSWORD/MT5_SERVER."
            )


def serialize(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return serialize(value.model_dump())

    if isinstance(value, dict):
        return {key: serialize(val) for key, val in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [serialize(item) for item in value]

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if isinstance(value, Decimal):
        return float(value)

    if hasattr(value, "_asdict"):
        return serialize(value._asdict())

    if isinstance(value, SimpleNamespace):
        return serialize(vars(value))

    if pd is not None:
        if isinstance(value, pd.DataFrame):
            records = value.to_dict(orient="records")
            return [serialize(record) for record in records]

        if isinstance(value, pd.Series):
            return serialize(value.to_dict())

        if isinstance(value, pd.Timestamp):
            return value.isoformat()

    if np is not None and isinstance(value, np.ndarray):
        return value.tolist()

    if np is not None and isinstance(value, np.generic):
        return value.item()

    if hasattr(value, "tolist"):
        try:
            return value.tolist()
        except Exception:  # pragma: no cover
            pass

    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:  # pragma: no cover
            pass

    return value


def load_payload() -> dict[str, Any]:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON payload: {exc}") from exc

    if not isinstance(payload, dict):
        raise ValueError("Root payload must be a JSON object.")

    return payload


def main() -> None:
    try:
        payload = load_payload()
        tool = payload.get("tool")
        if not tool:
            raise ValueError("Missing 'tool' in payload.")

        params = payload.get("params") or {}
        if not isinstance(params, dict):
            raise ValueError("'params' must be an object.")

        ensure_connection()

        func = getattr(mt5_main, tool, None)
        if func is None or not callable(func):
            raise ValueError(f"Unknown tool '{tool}'.")

        result = func(**params)

        response = {"ok": True, "result": serialize(result)}
        sys.stdout.write(json.dumps(response) + "\n")
        sys.exit(0)

    except Exception as exc:  # pylint: disable=broad-except
        details = {
            "type": exc.__class__.__name__,
            "message": str(exc),
            "traceback": traceback.format_exc(),
        }
        response = {"ok": False, "error": str(exc), "details": details}
        sys.stdout.write(json.dumps(response) + "\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
