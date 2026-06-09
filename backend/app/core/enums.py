from enum import StrEnum


class AppEnvironment(StrEnum):
    LOCAL = "local"
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class ExchangeCode(StrEnum):
    DSE = "DSE"
    CSE = "CSE"


class DataQualityFlag(StrEnum):
    OK = "OK"
    PARTIAL = "PARTIAL"
    SUSPICIOUS = "SUSPICIOUS"


class StockDetailsSyncJobStatus(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class StockDetailsSyncTriggerType(StrEnum):
    MANUAL = "MANUAL"
    EVENT = "EVENT"
    SCHEDULED = "SCHEDULED"


class StockDetailsSyncScope(StrEnum):
    """What `StockDetailsService.sync_stock_details` persists after a successful API fetch."""

    FULL = "full"
    STOCKS = "stocks"


class ReportPeriodType(StrEnum):
    QUARTERLY = "QUARTERLY"
    HALF_YEARLY = "HALF_YEARLY"
    ANNUAL = "ANNUAL"


class ReportStatus(StrEnum):
    UNAUDITED = "UNAUDITED"
    AUDITED = "AUDITED"
    RESTATED = "RESTATED"


class MetricValueType(StrEnum):
    AMOUNT = "AMOUNT"
    PERCENT = "PERCENT"
    RATIO = "RATIO"
    PER_SHARE = "PER_SHARE"
    COUNT = "COUNT"


class DividendType(StrEnum):
    CASH = "CASH"
    STOCK = "STOCK"
    MIXED = "MIXED"


class DividendStatus(StrEnum):
    DECLARED = "DECLARED"
    APPROVED = "APPROVED"
    PAID = "PAID"
    REVISED = "REVISED"


class CorporateActionType(StrEnum):
    DIVIDEND = "DIVIDEND"
    CAPITAL_CHANGE = "CAPITAL_CHANGE"
    TRADING_STATUS = "TRADING_STATUS"
    MEETING = "MEETING"
    RESTRUCTURING = "RESTRUCTURING"
    OTHER = "OTHER"


class CorporateActionSubtype(StrEnum):
    BONUS = "BONUS"
    RIGHTS = "RIGHTS"
    SPLIT = "SPLIT"
    MERGER = "MERGER"
    SPOT_TRADE = "SPOT_TRADE"
    TRADING_SUSPENSION = "TRADING_SUSPENSION"
    TRADING_RESUME = "TRADING_RESUME"
    AGM = "AGM"
    EGM = "EGM"
    OTHER = "OTHER"


class MarketEventType(StrEnum):
    NEWS = "NEWS"
    DISCLOSURE = "DISCLOSURE"
    BOARD_MEETING = "BOARD_MEETING"
    EARNINGS_RELEASE = "EARNINGS_RELEASE"
    REGULATORY = "REGULATORY"
    OTHER = "OTHER"


class IndicatorType(StrEnum):
    RSI = "RSI"
    SMA = "SMA"
    EMA = "EMA"


class SignalType(StrEnum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


class TraderRecommendation(StrEnum):
    BUY = "BUY"
    HOLD = "HOLD"
    WAIT = "WAIT"
    SELL = "SELL"


class RiskLevelLabel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    SPECULATIVE = "SPECULATIVE"


class LiquidityLabel(StrEnum):
    STRONG = "STRONG"
    NORMAL = "NORMAL"
    THIN = "THIN"
    ILLIQUID = "ILLIQUID"


class WarningSeverity(StrEnum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class PatternStatus(StrEnum):
    FORMING = "Forming"
    ACTIVE = "Active"
    CONFIRMED = "Confirmed"
    FAILED = "Failed"


class TrendDirection(StrEnum):
    UPTREND = "UPTREND"
    DOWNTREND = "DOWNTREND"
    SIDEWAYS = "SIDEWAYS"
    UNKNOWN = "UNKNOWN"


class UserGender(StrEnum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    PREFER_NOT_TO_SAY = "prefer_not_to_say"


class MoneySnapshotAssetCategory(StrEnum):
    CASH = "CASH"
    DEPOSIT = "DEPOSIT"
    SANCHAYAPATRA = "SANCHAYAPATRA"
    STOCK = "STOCK"
    MUTUAL_FUND = "MUTUAL_FUND"
    GOLD = "GOLD"
    PROPERTY = "PROPERTY"
    BUSINESS = "BUSINESS"
    OTHER = "OTHER"


class MoneySnapshotLiabilityCategory(StrEnum):
    LOAN = "LOAN"
    CREDIT = "CREDIT"
    MORTGAGE = "MORTGAGE"
    OTHER = "OTHER"


class LiquidityTier(StrEnum):
    IMMEDIATE = "IMMEDIATE"
    SHORT_TERM = "SHORT_TERM"
    LOCKED = "LOCKED"
    ILLIQUID = "ILLIQUID"


class WealthGoalCategory(StrEnum):
    EMERGENCY_FUND = "EMERGENCY_FUND"
    HOME = "HOME"
    RETIREMENT = "RETIREMENT"
    EDUCATION = "EDUCATION"
    HOUSE_PURCHASE = "HOUSE_PURCHASE"
    WEALTH_GROWTH = "WEALTH_GROWTH"
    ZAKAT_READINESS = "ZAKAT_READINESS"
    PASSIVE_INCOME = "PASSIVE_INCOME"
    OTHER = "OTHER"


class WealthGoalStatus(StrEnum):
    ACTIVE = "ACTIVE"
    REACHED = "REACHED"
    PAUSED = "PAUSED"


class WealthScenarioType(StrEnum):
    TOOL = "TOOL"
    COMPARISON = "COMPARISON"
    GOAL = "GOAL"


class WealthInsightSeverity(StrEnum):
    INFO = "INFO"
    POSITIVE = "POSITIVE"
    WARNING = "WARNING"
    NEUTRAL = "NEUTRAL"


class TaxPlannerMode(StrEnum):
    QUICK = "QUICK"
    DETAILED = "DETAILED"


class TaxPlannerGender(StrEnum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    OTHER = "OTHER"
    PREFER_NOT_TO_SAY = "PREFER_NOT_TO_SAY"


class TaxPlannerInsightType(StrEnum):
    UNUSED_REBATE_OPPORTUNITY = "UNUSED_REBATE_OPPORTUNITY"
    NO_ELIGIBLE_INVESTMENTS = "NO_ELIGIBLE_INVESTMENTS"
    MULTIPLE_INCOME_SOURCES = "MULTIPLE_INCOME_SOURCES"
    HIGH_REMAINING_INVESTMENT_CAPACITY = "HIGH_REMAINING_INVESTMENT_CAPACITY"
    OUT_OF_SCOPE_PROFILE = "OUT_OF_SCOPE_PROFILE"
    MINIMUM_TAX_NOT_MODELED = "MINIMUM_TAX_NOT_MODELED"

