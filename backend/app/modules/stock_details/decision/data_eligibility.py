from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.core.constants.trading_constants import (
    ANOMALOUS_DROP_PERCENT,
    ANOMALOUS_DROP_PRIOR_WINDOW,
    ELIGIBILITY_ABSOLUTE_MIN_TRADED_SESSION_RATIO,
    ELIGIBILITY_ABSOLUTE_MIN_VALID_ROWS,
    ELIGIBILITY_INELIGIBLE_MISSED_SESSIONS,
    ELIGIBILITY_MAX_MISSED_SESSIONS,
    ELIGIBILITY_MAX_PARTIAL_QUALITY_RATIO,
    ELIGIBILITY_MIN_TRADED_SESSION_RATIO,
    ELIGIBILITY_MIN_TURNOVER_OBSERVATIONS,
    ELIGIBILITY_MIN_VALID_ROWS,
    LIQUIDITY_TURNOVER_THIN,
)
from app.core.enums import (
    DataQualityFlag,
    EligibilityStatus,
    TurnoverProvenance,
)
from app.models import DailyPrice
from app.modules.stock_details.decision.technical import (
    TechnicalSnapshot,
    _to_float,
    select_valid_ohlc_rows,
)


@dataclass(frozen=True)
class EligibilityResult:
    status: EligibilityStatus
    reason_codes: tuple[str, ...]
    exchange_session_date: date | None
    latest_trade_date: date | None
    missed_session_count: int | None
    valid_ohlcv_row_count: int
    invalid_ohlcv_row_count: int
    traded_session_count: int
    zero_volume_session_count: int
    traded_session_ratio: float
    quality_ok_count: int
    quality_partial_count: int
    quality_suspicious_count: int
    median_turnover: float | None
    turnover_observation_count: int
    turnover_provenance: TurnoverProvenance
    analytical_price_basis: str
    corporate_action_status: str

    @property
    def allows_fresh_decision(self) -> bool:
        return self.status == EligibilityStatus.ELIGIBLE

    @property
    def is_stale(self) -> bool:
        return self.missed_session_count is not None and self.missed_session_count > 0


def _missed_exchange_sessions(
    latest_trade_date: date | None,
    exchange_session_dates: list[date] | tuple[date, ...] | None,
) -> tuple[date | None, int | None]:
    sessions = sorted(set(exchange_session_dates or ()))
    if latest_trade_date is None or not sessions:
        return (sessions[-1] if sessions else None), None
    return sessions[-1], sum(1 for session in sessions if session > latest_trade_date)


def _corporate_action_status(
    prices: list[DailyPrice],
    *,
    known_corporate_action_dates: set[date] | None,
    analytical_price_basis: str,
) -> str:
    valid_prices = select_valid_ohlc_rows(prices)
    if not valid_prices:
        return "NONE"
    latest = valid_prices[-1]
    known_date = bool(
        known_corporate_action_dates and latest.trade_date in known_corporate_action_dates
    )
    if analytical_price_basis == "SOURCE_ADJUSTED_CLOSE":
        return "RESOLVED" if known_date else "NONE"
    if known_date:
        return "KNOWN_UNADJUSTED"
    if len(valid_prices) < 2:
        return "NONE"

    latest_close = _to_float(latest.close_price)
    previous_close = _to_float(valid_prices[-2].close_price)
    if latest_close is None or previous_close is None or previous_close <= 0:
        return "NONE"
    move_percent = (latest_close / previous_close - 1) * 100
    if abs(move_percent) < ANOMALOUS_DROP_PERCENT:
        return "NONE"

    if move_percent < 0:
        prior_closes = [
            value
            for value in (
                _to_float(price.close_price)
                for price in valid_prices[-(ANOMALOUS_DROP_PRIOR_WINDOW + 2) : -1]
            )
            if value is not None
        ]
        if len(prior_closes) >= 2 and prior_closes[-1] < prior_closes[0]:
            return "GENUINE_DOWNTREND"
    return "UNRESOLVED_DISCONTINUITY"


def evaluate_data_eligibility(
    prices: list[DailyPrice],
    snapshot: TechnicalSnapshot,
    *,
    category: str | None,
    is_active: bool,
    exchange_session_dates: list[date] | tuple[date, ...] | None = None,
    known_corporate_action_dates: set[date] | None = None,
) -> EligibilityResult:
    sorted_prices = sorted(prices, key=lambda row: row.trade_date)
    quality_window = sorted_prices[-ELIGIBILITY_MIN_VALID_ROWS:]
    ok_count = sum(
        1 for price in quality_window if price.data_quality_flag == DataQualityFlag.OK
    )
    partial_count = sum(
        1 for price in quality_window if price.data_quality_flag == DataQualityFlag.PARTIAL
    )
    suspicious_count = sum(
        1 for price in quality_window if price.data_quality_flag == DataQualityFlag.SUSPICIOUS
    )
    latest_trade_date = (
        date.fromisoformat(snapshot.latest_trade_date) if snapshot.latest_trade_date else None
    )
    exchange_session_date, missed_sessions = _missed_exchange_sessions(
        latest_trade_date,
        exchange_session_dates,
    )
    corporate_action_status = _corporate_action_status(
        sorted_prices,
        known_corporate_action_dates=known_corporate_action_dates,
        analytical_price_basis=snapshot.analytical_price_basis,
    )

    reasons: list[str] = []
    severity = EligibilityStatus.ELIGIBLE

    def add_reason(code: str, status: EligibilityStatus) -> None:
        nonlocal severity
        reasons.append(code)
        ranks = {
            EligibilityStatus.ELIGIBLE: 0,
            EligibilityStatus.LIMITED: 1,
            EligibilityStatus.REVIEW_ONLY: 2,
            EligibilityStatus.INELIGIBLE: 3,
        }
        if ranks[status] > ranks[severity]:
            severity = status

    if not is_active:
        add_reason("inactive_or_suspended_stock", EligibilityStatus.INELIGIBLE)
    if not snapshot.latest_row_valid:
        add_reason("invalid_latest_ohlc", EligibilityStatus.INELIGIBLE)
    if snapshot.ohlcv_row_count < ELIGIBILITY_ABSOLUTE_MIN_VALID_ROWS:
        add_reason("insufficient_valid_history", EligibilityStatus.INELIGIBLE)
    elif snapshot.ohlcv_row_count < ELIGIBILITY_MIN_VALID_ROWS:
        add_reason("limited_valid_history", EligibilityStatus.LIMITED)

    if snapshot.traded_session_ratio < ELIGIBILITY_ABSOLUTE_MIN_TRADED_SESSION_RATIO:
        add_reason("insufficient_traded_session_coverage", EligibilityStatus.INELIGIBLE)
    elif snapshot.traded_session_ratio < ELIGIBILITY_MIN_TRADED_SESSION_RATIO:
        add_reason("low_traded_session_coverage", EligibilityStatus.LIMITED)
    if snapshot.volume <= 0:
        add_reason("latest_session_zero_volume", EligibilityStatus.REVIEW_ONLY)

    if missed_sessions is not None and missed_sessions > ELIGIBILITY_MAX_MISSED_SESSIONS:
        stale_status = (
            EligibilityStatus.INELIGIBLE
            if missed_sessions > ELIGIBILITY_INELIGIBLE_MISSED_SESSIONS
            else EligibilityStatus.REVIEW_ONLY
        )
        add_reason("stale_by_exchange_sessions", stale_status)
    if (
        exchange_session_date is not None
        and latest_trade_date is not None
        and latest_trade_date > exchange_session_date
    ):
        add_reason("stock_date_ahead_of_exchange_session", EligibilityStatus.REVIEW_ONLY)

    latest_quality = (
        sorted_prices[-1].data_quality_flag
        if sorted_prices
        else DataQualityFlag.SUSPICIOUS
    )
    if latest_quality == DataQualityFlag.SUSPICIOUS or suspicious_count > 0:
        add_reason("suspicious_price_quality", EligibilityStatus.REVIEW_ONLY)
    elif latest_quality == DataQualityFlag.PARTIAL:
        add_reason("partial_latest_price_quality", EligibilityStatus.LIMITED)
    if (
        quality_window
        and partial_count / len(quality_window) > ELIGIBILITY_MAX_PARTIAL_QUALITY_RATIO
    ):
        add_reason("excessive_partial_history", EligibilityStatus.LIMITED)

    if snapshot.median_turnover is None:
        add_reason("turnover_baseline_unavailable", EligibilityStatus.LIMITED)
    elif snapshot.median_turnover < LIQUIDITY_TURNOVER_THIN:
        add_reason("median_turnover_below_policy", EligibilityStatus.LIMITED)
    if snapshot.turnover_observation_count < ELIGIBILITY_MIN_TURNOVER_OBSERVATIONS:
        add_reason("insufficient_turnover_observations", EligibilityStatus.LIMITED)
    if snapshot.turnover_provenance in {
        TurnoverProvenance.ESTIMATED,
        TurnoverProvenance.UNKNOWN,
    }:
        add_reason("turnover_not_reported", EligibilityStatus.LIMITED)
    elif snapshot.turnover_provenance == TurnoverProvenance.MIXED:
        reasons.append("mixed_turnover_provenance")

    if (category or "").upper() == "Z":
        add_reason("category_z_review", EligibilityStatus.LIMITED)
    if corporate_action_status in {"KNOWN_UNADJUSTED", "UNRESOLVED_DISCONTINUITY"}:
        add_reason("unresolved_corporate_action", EligibilityStatus.REVIEW_ONLY)

    return EligibilityResult(
        status=severity,
        reason_codes=tuple(dict.fromkeys(reasons)),
        exchange_session_date=exchange_session_date,
        latest_trade_date=latest_trade_date,
        missed_session_count=missed_sessions,
        valid_ohlcv_row_count=snapshot.ohlcv_row_count,
        invalid_ohlcv_row_count=snapshot.invalid_ohlcv_row_count,
        traded_session_count=snapshot.traded_session_count,
        zero_volume_session_count=snapshot.zero_volume_session_count,
        traded_session_ratio=round(snapshot.traded_session_ratio, 4),
        quality_ok_count=ok_count,
        quality_partial_count=partial_count,
        quality_suspicious_count=suspicious_count,
        median_turnover=snapshot.median_turnover,
        turnover_observation_count=snapshot.turnover_observation_count,
        turnover_provenance=snapshot.turnover_provenance,
        analytical_price_basis=snapshot.analytical_price_basis,
        corporate_action_status=corporate_action_status,
    )
