from __future__ import annotations

import json
import math
from dataclasses import asdict, is_dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from hashlib import sha256
from typing import Any
from uuid import UUID


def canonicalize_audit_value(value: Any) -> Any:
    """Convert supported audit values into a stable JSON-compatible shape."""

    if is_dataclass(value) and not isinstance(value, type):
        return canonicalize_audit_value(asdict(value))
    if hasattr(value, "model_dump"):
        return canonicalize_audit_value(value.model_dump(mode="json"))
    if isinstance(value, dict):
        return {
            str(key): canonicalize_audit_value(item)
            for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))
        }
    if isinstance(value, (list, tuple)):
        return [canonicalize_audit_value(item) for item in value]
    if isinstance(value, (set, frozenset)):
        normalized = [canonicalize_audit_value(item) for item in value]
        return sorted(normalized, key=canonical_audit_json)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, Enum):
        return canonicalize_audit_value(value.value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Audit hashes do not accept NaN or infinite floats")
        return value
    if value is None or isinstance(value, (str, int, bool)):
        return value
    raise TypeError(f"Unsupported audit value type: {type(value).__name__}")


def canonical_audit_json(value: Any) -> str:
    return json.dumps(
        canonicalize_audit_value(value),
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )


def stable_audit_hash(value: Any) -> str:
    return sha256(canonical_audit_json(value).encode("utf-8")).hexdigest()
