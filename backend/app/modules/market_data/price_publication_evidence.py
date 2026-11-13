"""Immutable price-version membership in the existing append-only source journal."""
from dataclasses import dataclass
from datetime import date, datetime

PRICE_PUBLICATION_SOURCE = "market_price_publications"
PRICE_PUBLICATION_CONTRACT = "PRICE_VERSION_MEMBERSHIP_V1"


def _timestamp(value):
    try:
        value = datetime.fromisoformat(value) if isinstance(value, str) else value
    except ValueError:
        return None
    return value if isinstance(value, datetime) and value.tzinfo is not None else None


@dataclass(frozen=True)
class PricePublicationEvidence:
    trade_date: date
    sync_id: str
    source_last_synced_at: datetime
    published_at: datetime
    price_versions: tuple[dict, ...] = ()
    evidence_observed_at: datetime | None = None


def matching_publication_records(manifest, observations):
    return [item for item in observations if item.source_row_id == str(manifest.id)
        and item.payload.get("contract") == PRICE_PUBLICATION_CONTRACT
        and item.payload.get("manifest_id") == str(manifest.id)
        and item.payload.get("sync_id") == manifest.sync_id
        and item.payload.get("exchange") == manifest.exchange.value
        and item.payload.get("trade_date") == manifest.trade_date.isoformat()
        and _timestamp(item.payload.get("source_last_synced_at")) == manifest.source_last_synced_at]


def price_capture(manifest, observations):
    """Only a unique producer-attested capture can be inherited or finalized."""
    captures = [item for item in observations if item.source_row_id == str(manifest.id) and item.operation == "PUBLISH"]
    if len(captures) != 1 or captures[0] not in matching_publication_records(manifest, observations):
        return None
    capture = captures[0]
    raw = capture.payload.get("price_versions")
    if (_timestamp(capture.observed_at) is None or capture.finality not in {"LIVE", "FINALIZED"} or not isinstance(raw, list)
        or any(not isinstance(item, dict) for item in raw)):
        return None
    keys = [(item.get("stock_id"), item.get("id")) for item in raw]
    if (any(not all(isinstance(part, str) and part for part in key) for key in keys)
        or len(set(keys)) != len(keys)):
        return None
    return capture


def publication_evidence(manifest, observations):
    """Legacy clocks are not a certificate. LIVE promotion keeps its captured rows."""
    matching = matching_publication_records(manifest, observations)
    capture = price_capture(manifest, observations)
    versions, known_at = (), None
    if capture is not None:
        if capture.finality == "FINALIZED":
            known_at = capture.observed_at
        elif capture.finality == "LIVE":
            finals = [item for item in matching if item.operation == "FINALIZE" and item.finality == "FINALIZED"
                and item.payload.get("capture_id") == str(capture.id) and item.observed_at >= capture.observed_at]
            if finals:
                known_at = min(item.observed_at for item in finals)
        raw = capture.payload.get("price_versions")
        if known_at is not None and isinstance(raw, list):
            versions = tuple(raw)
    return PricePublicationEvidence(manifest.trade_date, manifest.sync_id,
        manifest.source_last_synced_at, manifest.published_at, versions, known_at)
