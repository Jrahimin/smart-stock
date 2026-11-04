from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from app.core.constants.trading_constants import (
    DECISION_TAXONOMY_VERSION,
    PULSE_SCORE_FOCUS_THRESHOLD,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.core.enums import (
    DecisionDisplayAction,
    EligibilityStatus,
    EntryReadiness,
    EntryTiming,
    ExchangeCode,
    MarketRegimePhase,
    OpportunityQuality,
    TraderRecommendation,
)
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
    horizons: tuple[int, ...] = (3, 5, 10, 20)
    minimum_history_rows: int = 50
    execution_price: Literal["open", "close"] = "open"
    one_way_cost_bps: float = 50
    order_value_bdt: float = 50_000
    initial_capital_bdt: float = 1_000_000
    maximum_entry_gap_percent: float = 5.0
    unknown_rule_policy: Literal["exclude", "assume"] = "exclude"
    assumed_tick_size: float = 0.1
    assumed_lot_size: int = 1
    assumed_settlement_sessions: int = 2
    slippage_multiplier: float = 1.0
    sensitivity_order_values: tuple[float, ...] = (25_000, 100_000, 250_000)
    replay_version: str = "corrected-phase1-replay-v2"
    maximum_turnover_fraction: float = 0.01
    slippage_tiers: tuple[SlippageTier, ...] = DEFAULT_SLIPPAGE_TIERS
    pulse_focus_threshold: int = PULSE_SCORE_FOCUS_THRESHOLD
    pulse_top_k: int = 5
    use_current_category_proxy: bool = False
    walk_forward_mode: Literal["expanding", "rolling"] = "expanding"
    initial_train_sessions: int = 25
    validation_sessions: int = 10
    rolling_train_sessions: int = 60
    frozen_test_sessions: int = 60
    strategy_version: str = TRADING_STRATEGY_VERSION
    threshold_version: str = TRADING_THRESHOLD_VERSION
    decision_taxonomy_version: str = DECISION_TAXONOMY_VERSION
    sensitivity_cost_bps: tuple[float, ...] = (25, 50, 75)
    sensitivity_pulse_thresholds: tuple[int, ...] = (55, 60, 65)

    def __post_init__(self) -> None:
        if self.start_date > self.end_date:
            raise ValueError("start_date must not be after end_date")
        if not self.horizons or any(horizon <= 0 for horizon in self.horizons):
            raise ValueError("horizons must contain positive session counts")
        if self.execution_price not in {"open", "close"}:
            raise ValueError("execution_price must be open or close")
        if self.unknown_rule_policy not in {"exclude", "assume"}:
            raise ValueError("unknown_rule_policy must be exclude or assume")
        if not self.slippage_tiers or any(row.slippage_bps < 0 for row in self.slippage_tiers):
            raise ValueError("At least one nonnegative slippage tier is required")
        if self.minimum_history_rows <= 0:
            raise ValueError("minimum_history_rows must be positive")
        if self.one_way_cost_bps < 0 or self.order_value_bdt <= 0:
            raise ValueError("costs must be non-negative and order value must be positive")
        if (
            self.initial_capital_bdt <= 0
            or self.maximum_entry_gap_percent < 0
            or self.assumed_tick_size <= 0
            or self.assumed_lot_size < 1
            or self.assumed_settlement_sessions < 0
            or self.slippage_multiplier < 0
        ):
            raise ValueError("Invalid capital, gap, tick, lot, settlement or slippage assumption")
        if not 0 < self.maximum_turnover_fraction <= 1:
            raise ValueError("maximum_turnover_fraction must be within (0, 1]")
        if not 1 <= self.pulse_top_k <= 100:
            raise ValueError("pulse_top_k must be within [1, 100]")
        if (
            min(
                self.initial_train_sessions,
                self.validation_sessions,
                self.rolling_train_sessions,
                self.frozen_test_sessions,
            )
            <= 0
        ):
            raise ValueError("walk-forward session counts must be positive")
        if self.strategy_version != TRADING_STRATEGY_VERSION:
            raise ValueError("This replay build can only execute the current strategy version")
        if self.threshold_version != TRADING_THRESHOLD_VERSION:
            raise ValueError("This replay build can only execute the current threshold version")
        if self.decision_taxonomy_version != DECISION_TAXONOMY_VERSION:
            raise ValueError("This replay build can only execute the current decision taxonomy")


@dataclass(frozen=True)
class ExecutionRule:
    effective_from: date
    effective_to: date
    known_at: datetime
    source_revision: str
    tick_size: float
    lot_size: int
    settlement_sessions: int
    lower_price_limit: float | None = None
    upper_price_limit: float | None = None

    def __post_init__(self):
        if (
            self.effective_from > self.effective_to
            or not self.source_revision
            or self.tick_size <= 0
            or self.lot_size < 1
            or self.settlement_sessions < 0
        ):
            raise ValueError("Execution rules require valid dated evidence and positive increments")


@dataclass(frozen=True)
class CorporateActionTerms:
    effective_date: date
    known_at: datetime
    source_revision: str
    shares_multiplier: float = 1.0
    cash_per_old_share: float = 0.0
    cash_pay_date: date | None = None

    def __post_init__(self):
        if self.shares_multiplier <= 0 or self.cash_per_old_share < 0 or not self.source_revision:
            raise ValueError("Corporate actions require verified share/cash terms")


@dataclass(frozen=True)
class StockReplayHistory:
    stock: Stock
    prices: tuple[DailyPrice, ...]
    corporate_action_dates: frozenset[date] = frozenset()
    suspension_dates: frozenset[date] = frozenset()
    circuit_locked_dates: frozenset[date] = frozenset()
    execution_rules: tuple[ExecutionRule, ...] = ()
    corporate_actions: tuple[CorporateActionTerms, ...] = ()
    event_observations: tuple[dict, ...] = ()
    captured_inputs: tuple[dict, ...] = ()
    event_coverage_verified: bool = False
    point_in_time_verified: bool = False
    instrument_history_verified: bool = False


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
    close_price: float | None
    sma20: float | None
    sma50: float | None
    rsi: float | None
    shared_decision_id: str
    opportunity_quality: OpportunityQuality | None = None
    entry_readiness: EntryReadiness = EntryReadiness.NOT_READY
    entry_timing: EntryTiming | None = None
    blocker_codes: tuple[str, ...] = ()
    regime_score: int = 50
    regime_phase: MarketRegimePhase = MarketRegimePhase.HEALTHY
    regime_confidence: int = 0
    internal_action: TraderRecommendation | None = None
    display_action: DecisionDisplayAction | None = None
    decision_taxonomy_version: str = DECISION_TAXONOMY_VERSION
    entry_condition: str | None = None
    preferred_entry_zone_low: float | None = None
    preferred_entry_zone_high: float | None = None
    trigger_price: float | None = None
    invalidation_price: float | None = None
    expiry_sessions: int | None = None
    average_volume: float | None = None
    target_price: float | None = None
    controlling_reason: str | None = None
    liquidity_tier: str = "UNKNOWN"
    research_features: tuple[tuple[str, float | None], ...] = ()


ExecutionStatus = Literal[
    "FILLED",
    "NO_NEXT_SESSION",
    "NO_STOCK_BAR",
    "ZERO_VOLUME",
    "SUSPENDED",
    "CIRCUIT_LOCKED",
    "INVALID_EXECUTION_PRICE",
    "CAPACITY_EXCEEDED",
    "EXPIRED_WITHOUT_ENTRY",
    "INVALIDATED_BEFORE_ENTRY",
    "AMBIGUOUS_PRE_ENTRY",
    "NOT_PERMITTED",
    "RULES_UNAVAILABLE",
    "GAP_REJECTED",
    "INVALID_PLAN",
    "LOT_TOO_LARGE",
    "PRICE_LIMIT",
    "CASH_UNAVAILABLE",
    "ALREADY_HELD",
]


@dataclass(frozen=True)
class ExecutionResult:
    status: ExecutionStatus
    execution_date: date | None = None
    raw_price: float | None = None
    fill_price: float | None = None
    slippage_bps: float | None = None
    activation_date: date | None = None
    attempt_dates: tuple[date, ...] = ()
    events: tuple[dict, ...] = ()
    quantity: int = 0
    settlement_date: date | None = None
    rules_verified: bool = False
    policy_id: str = "canonical-plan-v1"
    fill_timing: Literal["OPEN", "INTRADAY", "CLOSE"] | None = None

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
    "EXIT_BLOCKED",
    "BENCHMARK_UNAVAILABLE",
    "INVALID_MARKOUT_PRICE",
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
    outcome_end_date: date | None = None
    exit_reason: str | None = None
    exit_price: float | None = None
    exit_quantity: float | None = None
    cash_distribution_per_entry_share: float = 0.0
    events: tuple[dict, ...] = ()


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
    decision_taxonomy_version: str
    config_hash: str
    dataset_revision: str
    observation_revision: str
    outcome_revision: str
    manifest_id: str
    limitations: tuple[str, ...] = ()
    replay_version: str = "corrected-phase1-replay-v2"
    selection_revision: str = ""
    research_revision: str = ""
    engine_source_revision: str = ""


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
    partitions: dict[str, object] = field(default_factory=dict)
    research: dict[str, object] = field(default_factory=dict)
    audit: dict[str, object] = field(default_factory=dict)
