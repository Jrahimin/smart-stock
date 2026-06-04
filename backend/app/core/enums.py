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

