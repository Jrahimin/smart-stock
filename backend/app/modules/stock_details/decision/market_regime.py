from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.core.constants.trading_constants import (
    MARKET_REGIME_BEARISH,
    MARKET_REGIME_BULLISH,
    MARKET_REGIME_NEUTRAL,
    REGIME_BREADTH_BEARISH_RATIO,
    REGIME_BREADTH_BULLISH_RATIO,
    REGIME_EXTENDED_DISTANCE_PERCENT,
    REGIME_INDEX_BAND_PERCENT,
    REGIME_INDEX_LOOKBACK,
    REGIME_SCORE_TREND_CAP,
)
from app.core.enums import EntryTiming, MarketRegimePhase
from app.models import DailyMarketSummary

# The benchmark index name, in priority order, used to gauge the broad regime.
_PREFERRED_INDEX_NAMES = ("DSEX", "GENERAL")


@dataclass(frozen=True)
class MarketRegimeResult:
    score: int
    label: str
    phase: MarketRegimePhase
    confidence: int
    explanation: str
    permission_state: str | None = None
    as_of_session: date | None = None
    required_inputs_complete: bool | None = None

    def permits_plan(self, timing: EntryTiming | None) -> bool:
        if self.permission_state is not None:
            return self.permission_state in {"ORDINARY", "CAUTION"}
        if timing not in {EntryTiming.BREAKOUT, EntryTiming.CONTINUATION}:
            return True
        return (
            self.label != MARKET_REGIME_BEARISH
            and self.phase != MarketRegimePhase.REVERSAL_RISK
        )


def regime_identity(regime: MarketRegimeResult, *, legacy: bool) -> dict:
    from dataclasses import asdict
    payload = asdict(regime)
    if legacy:
        for key in ("permission_state", "as_of_session", "required_inputs_complete"):
            payload.pop(key, None)
    return payload


_CONTEXT_VALUE_FIELDS = ("session_date", "index_name", "index_close", "advancing", "declining", "source", "is_finalized", "database_updated_at")


def market_context_revision_payload(observation):
    """The existing producer's committed values, including its optional breadth field.

    Earlier captures omitted unchanged; explicit null in the current format is
    a different payload. Ownership and knowledge clocks are validated separately.
    """
    if not isinstance(observation, dict) or not all(key in observation for key in _CONTEXT_VALUE_FIELDS):
        return None
    payload = {key: observation[key] for key in _CONTEXT_VALUE_FIELDS}
    if "unchanged" in observation:
        payload["unchanged"] = observation["unchanged"]
    return payload


def market_context_source_revision(observation):
    from app.core.audit_hashing import stable_audit_hash
    payload = market_context_revision_payload(observation)
    return stable_audit_hash(payload) if payload is not None else None


def market_context_revision_matches(observation):
    try:
        expected = market_context_source_revision(observation)
    except (TypeError, ValueError):
        return False
    return expected is not None and observation.get("source_revision") == expected


def market_context_day(value):
    """Producer wire dates are canonical ISO dates, never ordering fallbacks."""
    if not isinstance(value, str):
        return None
    try:
        day = date.fromisoformat(value)
    except ValueError:
        return None
    return day if day.isoformat() == value else None


def market_observation_valid(row, *, require_revision=False):
    """Validate selectors and value shape before they can select other evidence.

    Unauthenticated retrospective rows may lack producer metadata. A claimed
    producer observation still needs its complete committed payload and digest.
    Nullable/negative breadth remains representable; permission checks own its
    economic validity, and a supported immutable owner retains its own facts.
    """
    from decimal import Decimal
    from math import isfinite
    from app.modules.stock_details.decision.entry_path_evidence import _time
    if not isinstance(row, dict) or market_context_day(row.get("session_date")) is None:
        return False
    if row.get("provenance_status") is not None and not isinstance(row["provenance_status"], str):
        return False
    if "source_revision" in row and not isinstance(row["source_revision"], str):
        return False
    producer = require_revision or "source_revision" in row or row.get("authenticated") is True or row.get("provenance_status") in {
        "CAPTURED_AS_KNOWN_COMPLETED_INPUT", "UNVERIFIED_INPUT"}
    if producer:
        context_day = market_context_day(row.get("context_session_date"))
        if (_time(row.get("known_at")) is None or context_day is None or row["session_date"] > context_day.isoformat()
            or not isinstance(row.get("generation_id"), str) or not row["generation_id"]
            or type(row.get("authenticated")) is not bool
            or row.get("provenance_status") != ("CAPTURED_AS_KNOWN_COMPLETED_INPUT" if row["authenticated"] else "UNVERIFIED_INPUT")):
            return False
    if "index_name" in row and (not isinstance(row["index_name"], str) or not row["index_name"].strip()):
        return False
    if row.get("context_session_date") is not None and market_context_day(row["context_session_date"]) is None:
        return False
    if row.get("generation_id") is not None and (not isinstance(row["generation_id"], str) or not row["generation_id"]):
        return False
    for key in ("known_at", "database_updated_at"):
        if row.get(key) is not None and _time(row[key]) is None:
            return False
    if "authenticated" in row and type(row["authenticated"]) is not bool:
        return False
    if row.get("is_finalized") is not None and type(row["is_finalized"]) is not bool:
        return False
    if row.get("source") is not None and not isinstance(row["source"], str):
        return False
    close = row.get("index_close")
    if close is not None:
        if isinstance(close, bool) or not isinstance(close, (int, float, Decimal) if producer else (int, float, Decimal, str)):
            return False
        try:
            if not isfinite(float(close)):
                return False
        except (ValueError, TypeError, ArithmeticError):
            return False
    if any(row.get(key) is not None and type(row[key]) is not int for key in ("advancing", "declining", "unchanged")):
        return False
    return not producer or market_context_revision_matches(row)


def select_market_session_observation(candidates, *, cutoff=None, require_trusted=True):
    """Resolve the whole then-known tie before considering its trust flags."""
    from datetime import UTC, datetime
    from app.core.audit_hashing import stable_audit_hash
    from app.modules.stock_details.decision.entry_path_evidence import _time
    boundary = _time(cutoff)
    if require_trusted and boundary is None:
        return None
    eligible = [row for row in candidates if _time(row.get("known_at")) is None
        or boundary is None or _time(row["known_at"]) <= boundary]
    if not eligible:
        return None
    latest = max(_time(row.get("known_at")) or datetime.min.replace(tzinfo=UTC) for row in eligible)
    tied = [row for row in eligible if (_time(row.get("known_at")) or datetime.min.replace(tzinfo=UTC)) == latest]
    signatures = {stable_audit_hash(market_context_revision_payload(row) or {
        key: row.get(key) for key in (*_CONTEXT_VALUE_FIELDS, "unchanged")}) for row in tied}
    if len(signatures) != 1 or require_trusted and any(row.get("authenticated") is not True or row.get("is_finalized") is not True
        or _time(row.get("database_updated_at")) is None or _time(row["database_updated_at"]) > latest for row in tied):
        return None
    return tied[0]


def resolve_market_observation_sessions(observations, *, as_of, cutoff=None, require_trusted=True, limit=51):
    """Validate the collection, then resolve distinct sessions before cropping."""
    if not isinstance(observations, (list, tuple)) or not all(market_observation_valid(row, require_revision=require_trusted) for row in observations):
        return None
    groups = {}
    for row in observations:
        if row["session_date"] <= as_of.isoformat():
            groups.setdefault(row["session_date"], []).append(row)
    # Keep an unresolved date in its position. Removing it would let an older
    # session fill the required window. Only required dates need trusted values.
    selected = [select_market_session_observation(groups[day], cutoff=cutoff, require_trusted=False) for day in sorted(groups)]
    required = selected[-limit:]
    if any(row is None for row in required) or require_trusted and any(
        select_market_session_observation(groups[row["session_date"]], cutoff=cutoff, require_trusted=True) is None for row in required):
        return None
    return required


def capture_market_context(summaries, *, session_date, captured_at, generation_id, session_dates):
    """Immutable input-availability evidence, separate from executable quote proof."""
    from math import isfinite
    from app.modules.stock_details.decision.entry_path_evidence import _time
    rows = []
    for row in summaries:
        if row.trade_date > session_date:
            continue
        value = {"session_date": row.trade_date.isoformat(), "index_name": row.index_name,
            "index_close": float(row.index_close) if row.index_close is not None else None,
            "advancing": row.advancing_issues, "declining": row.declining_issues, "source": row.source,
            "unchanged": getattr(row, "unchanged_issues", None),
            "is_finalized": getattr(row, "is_finalized", None),
            "database_updated_at": row.updated_at.isoformat() if row.updated_at else None}
        finalized = getattr(row, "is_finalized", None) is True
        updated = _time(row.updated_at)
        valid = bool(finalized and updated and updated <= captured_at and row.trade_date in session_dates
            and value["index_close"] is not None and isfinite(value["index_close"]) and value["index_close"] > 0)
        rows.append({**value, "source_revision": market_context_source_revision(value), "known_at": captured_at.isoformat(),
            "context_session_date": session_date.isoformat(), "generation_id": generation_id,
            "authenticated": valid, "provenance_status": "CAPTURED_AS_KNOWN_COMPLETED_INPUT" if valid else "UNVERIFIED_INPUT",
            "execution_quote_authority": False})
    return rows


def compute_shadow_market_regime(observations: list[dict], *, as_of: date, allow_reconstructed: bool = False,
                                expected_sessions=(), selection_at=None, session_cutoffs=None) -> MarketRegimeResult:
    """Two consecutive exchange sessions with separately bound as-known vintages.

    A session calendar and exact selection/capture instants are evidence inputs,
    never inferred from weekdays. Reconstruction is an explicit audit mode.
    """
    from math import isfinite
    from app.modules.stock_details.decision.entry_path_evidence import _time

    def unknown():
        return MarketRegimeResult(50, MARKET_REGIME_NEUTRAL, MarketRegimePhase.HEALTHY, 0,
            "Market permission unknown: consecutive as-of sessions and authenticated vintage baselines are required.",
            "UNKNOWN", as_of, False)
    if not isinstance(observations, (list, tuple)) or not all(market_observation_valid(row, require_revision=not allow_reconstructed) for row in observations):
        return unknown()
    if not isinstance(expected_sessions, (list, tuple, set, frozenset)):
        return unknown()
    parsed = [day if type(day) is date else market_context_day(day) for day in expected_sessions]
    if any(day is None for day in parsed):
        return unknown()
    expected = sorted(set(day for day in parsed if day <= as_of))
    if not expected and allow_reconstructed:
        expected = sorted({date.fromisoformat(str(row["session_date"])) for row in observations if str(row["session_date"]) <= as_of.isoformat()})
    if len(expected) < 51 or expected[-1] != as_of:
        return unknown()
    selected = _time(selection_at)
    if not allow_reconstructed and (selected is None or not session_cutoffs):
        return unknown()
    states = []
    for end in (len(expected)-2, len(expected)-1):
        day = expected[end]
        cutoff = _time((session_cutoffs or {}).get(day.isoformat()))
        if not allow_reconstructed and (cutoff is None or cutoff > selected):
            return unknown()
        chosen = []
        for window_day in expected[end-49:end+1]:
            candidates = [row for row in observations if str(row.get("session_date")) == window_day.isoformat()
                and (row.get("context_session_date") is None or row["context_session_date"] == day.isoformat())]
            latest = select_market_session_observation(candidates, cutoff=cutoff, require_trusted=not allow_reconstructed)
            if latest is None:
                return unknown()
            value = latest.get("index_close")
            if value is None or not isfinite(float(value)) or float(value) <= 0:
                return unknown()
            chosen.append(latest)
        latest = chosen[-1]
        advancing, declining = latest.get("advancing"), latest.get("declining")
        if (type(advancing) is not int or type(declining) is not int
            or advancing < 0 or declining < 0 or advancing+declining <= 0):
            return unknown()
        mean = sum(float(row["index_close"]) for row in chosen)/50
        close = float(latest["index_close"])
        breadth = advancing/(advancing+declining)
        states.append(((close/mean-1)*100, breadth, close < mean*0.995 and abs(close-mean*0.995) > 1e-9))
    restricted = all(weak and breadth <= .40 for _,breadth,weak in states)
    distance,breadth,weak = states[-1]
    state = "RESTRICTED" if restricted else "CAUTION" if weak or breadth < .55 else "ORDINARY"
    return MarketRegimeResult(35 if restricted else 50 if state == "CAUTION" else 65,
        MARKET_REGIME_BEARISH if restricted else MARKET_REGIME_NEUTRAL if state == "CAUTION" else MARKET_REGIME_BULLISH,
        MarketRegimePhase.REVERSAL_RISK if restricted else MarketRegimePhase.HEALTHY, 0 if allow_reconstructed else 100,
        f"{'Reconstructed' if allow_reconstructed else 'Authenticated'} market permission {state.lower()}: index {distance:+.3f}%, advancing breadth {breadth:.2%}.",
        state, as_of, True)


def _clamp_score(value: float) -> int:
    return max(0, min(100, round(value)))


def classify_market_regime(
    index_closes: list[float],
    advancing: int | None,
    declining: int | None,
) -> str:
    """Classify BULLISH / NEUTRAL / BEARISH from index trend and breadth."""
    if not index_closes:
        return MARKET_REGIME_NEUTRAL

    latest = index_closes[-1]
    window = index_closes[-REGIME_INDEX_LOOKBACK:]
    average = sum(window) / len(window)
    if average <= 0:
        return MARKET_REGIME_NEUTRAL

    band = average * (REGIME_INDEX_BAND_PERCENT / 100)
    index_above = latest > average + band
    index_below = latest < average - band

    breadth_ratio: float | None = None
    if advancing is not None and declining is not None and (advancing + declining) > 0:
        breadth_ratio = advancing / (advancing + declining)
    bullish_breadth = (
        breadth_ratio is not None and breadth_ratio >= REGIME_BREADTH_BULLISH_RATIO
    )
    bearish_breadth = (
        breadth_ratio is not None and breadth_ratio <= REGIME_BREADTH_BEARISH_RATIO
    )

    if index_above and not bearish_breadth:
        return MARKET_REGIME_BULLISH
    if index_below and not bullish_breadth:
        return MARKET_REGIME_BEARISH
    return MARKET_REGIME_NEUTRAL


def compute_market_regime_result(
    index_closes: list[float],
    advancing: int | None,
    declining: int | None,
) -> MarketRegimeResult:
    if not index_closes:
        return MarketRegimeResult(
            score=50,
            label=MARKET_REGIME_NEUTRAL,
            phase=MarketRegimePhase.HEALTHY,
            confidence=0,
            explanation=(
                "Market regime is neutral because completed-session index history is unavailable."
            ),
        )

    latest = index_closes[-1]
    window = index_closes[-REGIME_INDEX_LOOKBACK:]
    average = sum(window) / len(window)
    if average <= 0:
        return MarketRegimeResult(
            score=50,
            label=MARKET_REGIME_NEUTRAL,
            phase=MarketRegimePhase.HEALTHY,
            confidence=0,
            explanation="Market regime is neutral because the index baseline is invalid.",
        )

    distance_percent = (latest / average - 1) * 100
    trend_component = max(
        -REGIME_SCORE_TREND_CAP,
        min(
            REGIME_SCORE_TREND_CAP,
            distance_percent
            / REGIME_EXTENDED_DISTANCE_PERCENT
            * REGIME_SCORE_TREND_CAP,
        ),
    )
    breadth_ratio: float | None = None
    if advancing is not None and declining is not None and advancing + declining > 0:
        breadth_ratio = advancing / (advancing + declining)
    breadth_component = 0.0 if breadth_ratio is None else (breadth_ratio - 0.5) * 40
    score = _clamp_score(50 + trend_component + breadth_component)
    label = classify_market_regime(index_closes, advancing, declining)

    phase = MarketRegimePhase.HEALTHY
    if label == MARKET_REGIME_BEARISH:
        phase = MarketRegimePhase.REVERSAL_RISK
    elif label == MARKET_REGIME_BULLISH:
        previous_window = index_closes[:-1][-REGIME_INDEX_LOOKBACK:]
        previous_average = (
            sum(previous_window) / len(previous_window) if previous_window else latest
        )
        previous_was_above = (
            len(index_closes) > 1
            and index_closes[-2]
            > previous_average * (1 + REGIME_INDEX_BAND_PERCENT / 100)
        )
        if not previous_was_above:
            phase = MarketRegimePhase.EARLY
        elif distance_percent >= REGIME_EXTENDED_DISTANCE_PERCENT:
            phase = MarketRegimePhase.EXTENDED

    coverage_confidence = min(70, round(len(window) / REGIME_INDEX_LOOKBACK * 70))
    confidence = coverage_confidence + (30 if breadth_ratio is not None else 0)
    breadth_text = (
        "breadth unavailable"
        if breadth_ratio is None
        else f"advancing breadth {breadth_ratio * 100:.1f}%"
    )
    return MarketRegimeResult(
        score=score,
        label=label,
        phase=phase,
        confidence=confidence,
        explanation=(
            f"Completed-session index is {distance_percent:+.2f}% versus its baseline; "
            f"{breadth_text}."
        ),
    )


def market_regime_result_from_label(label: str | None) -> MarketRegimeResult:
    normalized = (label or MARKET_REGIME_NEUTRAL).upper()
    if normalized == MARKET_REGIME_BULLISH:
        return MarketRegimeResult(
            65,
            MARKET_REGIME_BULLISH,
            MarketRegimePhase.HEALTHY,
            0,
            "Only the legacy bullish regime label was supplied.",
        )
    if normalized == MARKET_REGIME_BEARISH:
        return MarketRegimeResult(
            35,
            MARKET_REGIME_BEARISH,
            MarketRegimePhase.REVERSAL_RISK,
            0,
            "Only the legacy bearish regime label was supplied.",
        )
    return MarketRegimeResult(
        50,
        MARKET_REGIME_NEUTRAL,
        MarketRegimePhase.HEALTHY,
        0,
        "Only a neutral or missing legacy regime label was supplied.",
    )


def normalize_market_regime(
    regime: MarketRegimeResult | str | None,
) -> MarketRegimeResult:
    if isinstance(regime, MarketRegimeResult):
        return regime
    return market_regime_result_from_label(regime)


def resolve_regime_result_from_summaries(
    summaries: list[DailyMarketSummary],
    *,
    decision_session_date: date | None = None,
    allow_reconstructed: bool = False,
    exchange_session_dates=(),
) -> MarketRegimeResult:
    """Compute one capped regime result from completed-session summaries."""
    completed_summaries = [
        row
        for row in summaries
        if decision_session_date is None or row.trade_date <= decision_session_date
    ]
    if not completed_summaries:
        return compute_market_regime_result([], None, None)

    index_name = next(
        (
            name
            for name in _PREFERRED_INDEX_NAMES
            if any(row.index_name == name for row in completed_summaries)
        ),
        None,
    )
    if index_name is not None:
        relevant = [row for row in completed_summaries if row.index_name == index_name]
    else:
        by_index: dict[str, list[DailyMarketSummary]] = {}
        for row in completed_summaries:
            by_index.setdefault(row.index_name, []).append(row)
        relevant = max(by_index.values(), key=len) if by_index else []

    relevant = sorted(relevant, key=lambda row: row.trade_date)
    index_closes = [float(row.index_close) for row in relevant if row.index_close is not None]
    latest = relevant[-1] if relevant else None
    advancing = latest.advancing_issues if latest is not None else None
    declining = latest.declining_issues if latest is not None else None
    from dataclasses import replace
    from math import isfinite
    expected = decision_session_date or (latest.trade_date if latest else None)
    # Phase compares the preceding 50-close baseline too, so its dependency is
    # 51 observations even though the current mean itself uses only 50.
    required = relevant[-(REGIME_INDEX_LOOKBACK+1):]
    known_sessions = sorted({day for day in exchange_session_dates if expected is None or day <= expected})
    expected_required = known_sessions[-(REGIME_INDEX_LOOKBACK+1):]
    complete = bool(latest and latest.trade_date == expected and len(required) == REGIME_INDEX_LOOKBACK+1
        and len({row.trade_date for row in required}) == REGIME_INDEX_LOOKBACK+1
        and (not known_sessions or len(expected_required) == REGIME_INDEX_LOOKBACK+1 and [row.trade_date for row in required] == expected_required)
        and all(row.index_close is not None and isfinite(float(row.index_close)) and float(row.index_close) > 0 for row in required)
        and (allow_reconstructed or all(getattr(row, "is_finalized", None) is True for row in required))
        and type(advancing) is int and type(declining) is int and advancing >= 0 and declining >= 0 and advancing+declining > 0
        and (getattr(latest, "unchanged_issues", None) is None or type(latest.unchanged_issues) is int and latest.unchanged_issues >= 0))
    result=compute_market_regime_result(index_closes, advancing, declining)
    return replace(result,
        explanation=("Reconstructed input diagnostics: "+result.explanation) if allow_reconstructed else result.explanation,
        as_of_session=latest.trade_date if latest else None, required_inputs_complete=complete)


def resolve_regime_from_summaries(
    summaries: list[DailyMarketSummary],
    *,
    decision_session_date: date | None = None,
) -> str:
    """Backward-compatible label projection for callers not yet on the typed result."""
    return resolve_regime_result_from_summaries(
        summaries,
        decision_session_date=decision_session_date,
    ).label
