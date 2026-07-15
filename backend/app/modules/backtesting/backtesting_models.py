from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Literal
from uuid import UUID

from app.core.constants.trading_constants import (
    PULSE_SCORE_FOCUS_THRESHOLD,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.core.enums import EligibilityStatus, ExchangeCode, TraderRecommendation
from app.models import DailyMarketSummary, DailyPrice, Stock


@dataclass(frozen=True)
class SlippageTier:
    minimum_median_turnover: float
    slippage_bps: float


DEFAULT_SLIPPAGE_TIERS: tuple[SlippageTier, ...] = (
    SlippageTier(50_000_000, 10),
    SlippageTier(10_000_000, 25),
    SlippageTier(2_000_000, 50),
    SlippageTier(0, 100),
)


@dataclass(frozen=True)
class BacktestConfig:
    exchange: ExchangeCode
    start_date: date
    end_date: date
    horizons: tuple[int, ...] = (5, 10, 20)
    minimum_history_rows: int = 50
    execution_price: Literal["open", "close"] = "open"
    one_way_cost_bps: float = 50
    order_value_bdt: float = 100_000
    maximum_turnover_fraction: float = 0.01
    slippage_tiers: tuple[SlippageTier, ...] = DEFAULT_SLIPPAGE_TIERS
    pulse_focus_threshold: int = PULSE_SCORE_FOCUS_THRESHOLD
    pulse_top_k: int = 5
    use_current_category_proxy: bool = False
    walk_forward_mode: Literal["expanding", "rolling"] = "expanding"
    initial_train_sessions: int = 25
    validation_sessions: int = 10
    rolling_train_sessions: int = 60
    frozen_test_sessions: int = 20
    strategy_version: str = TRADING_STRATEGY_VERSION
    threshold_version: str = TRADING_THRESHOLD_VERSION
    sensitivity_cost_bps: tuple[float, ...] = (25, 50, 75)
    sensitivity_pulse_thresholds: tuple[int, ...] = (55, 60, 65)

    def __post_init__(self) -> None:
        if self.start_date > self.end_date:
            raise ValueError("start_date must not be after end_date")
        if not self.horizons or any(horizon <= 0 for horizon in self.horizons):
            raise ValueError("horizons must contain positive session counts")
        if self.execution_price not in {"open", "close"}:
            raise ValueError("execution_price must be open or close")
        if self.minimum_history_rows <= 0:
            raise ValueError("minimum_history_rows must be positive")
        if self.one_way_cost_bps < 0 or self.order_value_bdt <= 0:
            raise ValueError("costs must be non-negative and order value must be positive")
        if not 0 < self.maximum_turnover_fraction <= 1:
            raise ValueError("maximum_turnover_fraction must be within (0, 1]")
        if not 1 <= self.pulse_top_k <= 100:
            raise ValueError("pulse_top_k must be within [1, 100]")
        if min(
            self.initial_train_sessions,
            self.validation_sessions,
            self.rolling_train_sessions,
            self.frozen_test_sessions,
        ) <= 0:
            raise ValueError("walk-forward session counts must be positive")
        if self.strategy_version != TRADING_STRATEGY_VERSION:
            raise ValueError("This replay build can only execute the current strategy version")
        if self.threshold_version != TRADING_THRESHOLD_VERSION:
            raise ValueError("This replay build can only execute the current threshold version")


@dataclass(frozen=True)
class StockReplayHistory:
    stock: Stock
    prices: tuple[DailyPrice, ...]
    corporate_action_dates: frozenset[date] = frozenset()
    suspension_dates: frozenset[date] = frozenset()
    circuit_locked_dates: frozenset[date] = frozenset()


@dataclass(frozen=True)
class BacktestDataset:
    histories: tuple[StockReplayHistory, ...]
    session_dates: tuple[date, ...]
    market_summaries: tuple[DailyMarketSummary, ...] = ()
    limitations: tuple[str, ...] = ()


@dataclass(frozen=True)
class ReplayObservation:
    stock_id: UUID
    symbol: str
    sector: str | None
    category: str | None
    as_of_date: date
    market_regime: str
    recommendation: TraderRecommendation
    eligibility_status: EligibilityStatus
    eligibility_reason_codes: tuple[str, ...]
    evidence_strength: int
    opportunity_score: int
    pulse_score: int
    median_turnover: float | None
    traded_session_ratio: float | None
    close_price: float
    sma20: float | None
    sma50: float | None
    rsi: float | None
    shared_decision_id: str


ExecutionStatus = Literal[
    "FILLED",
    "NO_NEXT_SESSION",
    "NO_STOCK_BAR",
    "ZERO_VOLUME",
    "SUSPENDED",
    "CIRCUIT_LOCKED",
    "INVALID_EXECUTION_PRICE",
    "CAPACITY_EXCEEDED",
]


@dataclass(frozen=True)
class ExecutionResult:
    status: ExecutionStatus
    execution_date: date | None = None
    raw_price: float | None = None
    fill_price: float | None = None
    slippage_bps: float | None = None

    @property
    def is_filled(self) -> bool:
        return self.status == "FILLED"


OutcomeStatus = Literal[
    "AVAILABLE",
    "UNFILLED",
    "INSUFFICIENT_HORIZON",
    "NO_HORIZON_BAR",
    "ZERO_VOLUME_AT_HORIZON",
    "CORPORATE_ACTION_UNRESOLVED",
]


@dataclass(frozen=True)
class ForwardOutcome:
    stock_id: UUID
    as_of_date: date
    horizon_sessions: int
    status: OutcomeStatus
    execution_status: ExecutionStatus
    horizon_date: date | None = None
    raw_close_return_percent: float | None = None
    net_return_percent: float | None = None
    benchmark_return_percent: float | None = None
    excess_return_percent: float | None = None
    maximum_favorable_excursion_percent: float | None = None
    maximum_adverse_excursion_percent: float | None = None


@dataclass(frozen=True)
class WalkForwardSplit:
    fold: int
    train_start: date
    train_end: date
    validation_start: date
    validation_end: date
    purged_sessions: int
    mode: str


@dataclass(frozen=True)
class FrozenTestPeriod:
    start: date
    end: date
    sessions: int


@dataclass(frozen=True)
class ReplayManifest:
    schema_version: str
    strategy_version: str
    threshold_version: str
    input_schema_version: str
    config_hash: str
    dataset_revision: str
    observation_revision: str
    outcome_revision: str
    manifest_id: str
    limitations: tuple[str, ...] = ()


@dataclass(frozen=True)
class BacktestReport:
    config: BacktestConfig
    manifest: ReplayManifest
    session_count: int
    stock_count: int
    observation_count: int
    outcome_count: int
    folds: tuple[WalkForwardSplit, ...]
    frozen_test: FrozenTestPeriod | None
    coverage: dict[str, object]
    decision_metrics: dict[str, object]
    strategy_metrics: dict[str, object]
    stratified_metrics: dict[str, object]
    pulse_metrics: dict[str, object]
    calibration: dict[str, object]
    sensitivity: tuple[dict[str, object], ...]
    limitations: tuple[str, ...] = field(default_factory=tuple)
