from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PostgresUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database_session import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.core.enums import (
    CorporateActionSubtype,
    CorporateActionType,
    DataQualityFlag,
    DividendStatus,
    DividendType,
    ExchangeCode,
    IndicatorType,
    MarketEventType,
    MetricValueType,
    ReportPeriodType,
    ReportStatus,
    SignalType,
    StockDetailsSyncJobStatus,
    StockDetailsSyncTriggerType,
    UserGender,
)


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        UniqueConstraint("mobile_number", name="uq_users_mobile_number"),
        Index("ix_users_email", "email"),
    )

    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    mobile_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    gender: Mapped[UserGender | None] = mapped_column(Enum(UserGender), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    profile_pic_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    identities = relationship("UserIdentity", back_populates="user", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    email_verification_tokens = relationship(
        "EmailVerificationToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    watchlist_entries = relationship(
        "UserWatchlist",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class UserWatchlist(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_watchlist"
    __table_args__ = (
        UniqueConstraint("user_id", "stock_id", name="uq_user_watchlist_user_stock"),
        CheckConstraint("buy_price IS NULL OR buy_price >= 0", name="user_watchlist_buy_price_non_negative"),
        Index("ix_user_watchlist_user_created", "user_id", "created_at"),
        Index("ix_user_watchlist_user_holding", "user_id", "is_holding"),
        Index("ix_user_watchlist_stock_id", "stock_id"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    stock_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("stocks.id", ondelete="CASCADE"),
        nullable=False,
    )
    stock_symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    is_holding: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    buy_price: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    user = relationship("User", back_populates="watchlist_entries")
    stock = relationship("Stock")


class UserIdentity(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_identities"
    __table_args__ = (
        UniqueConstraint("provider", "provider_subject_id", name="uq_user_identities_provider_subject"),
        Index("ix_user_identities_user_provider", "user_id", "provider"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_subject_id: Mapped[str] = mapped_column(String(255), nullable=False)

    user = relationship("User", back_populates="identities")


class RefreshToken(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
        Index("ix_refresh_tokens_user_expires", "user_id", "expires_at"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="refresh_tokens")


class EmailVerificationToken(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "email_verification_tokens"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_email_verification_tokens_token_hash"),
        Index("ix_email_verification_tokens_user_expires", "user_id", "expires_at"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="email_verification_tokens")


class Stock(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "stocks"
    __table_args__ = (
        UniqueConstraint("exchange", "symbol", name="uq_stocks_exchange_symbol"),
        Index("ix_stocks_symbol", "symbol"),
        Index("ix_stocks_exchange_symbol", "exchange", "symbol"),
        Index("ix_stocks_sector", "sector"),
        Index("ix_stocks_details_fetch", "exchange", "is_active", "should_fetch_details"),
    )

    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    exchange: Mapped[ExchangeCode] = mapped_column(Enum(ExchangeCode), nullable=False)
    sector: Mapped[str | None] = mapped_column(String(120), nullable=True)
    category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    isin: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True)
    listing_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    lot_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    paid_up_capital: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)
    market_cap: Mapped[Decimal | None] = mapped_column(Numeric(24, 4), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    should_fetch_details: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    daily_prices = relationship("DailyPrice", back_populates="stock")
    technical_indicators = relationship("TechnicalIndicator", back_populates="stock")
    trading_signals = relationship("TradingSignal", back_populates="stock")
    financial_reports = relationship("FinancialReport", back_populates="stock")
    dividend_events = relationship("DividendEvent", back_populates="stock")
    shareholding_snapshots = relationship("ShareholdingSnapshot", back_populates="stock")
    valuation_snapshots = relationship("ValuationSnapshot", back_populates="stock")
    corporate_actions = relationship("CorporateAction", back_populates="stock")
    market_events = relationship("MarketEvent", back_populates="stock")
    stock_details_sync_jobs = relationship("StockDetailsSyncJob", back_populates="stock")
    watchlist_entries = relationship("UserWatchlist", back_populates="stock")


class DailyPrice(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "daily_prices"
    __table_args__ = (
        UniqueConstraint("stock_id", "trade_date", name="uq_daily_prices_stock_trade_date"),
        CheckConstraint("open_price >= 0", name="open_price_non_negative"),
        CheckConstraint("high_price >= 0", name="high_price_non_negative"),
        CheckConstraint("low_price >= 0", name="low_price_non_negative"),
        CheckConstraint("close_price >= 0", name="close_price_non_negative"),
        CheckConstraint(
            "adjusted_close_price IS NULL OR adjusted_close_price >= 0",
            name="adjusted_close_price_non_negative",
        ),
        CheckConstraint("volume >= 0", name="volume_non_negative"),
        CheckConstraint("high_price >= low_price", name="high_price_greater_than_low_price"),
        Index("ix_daily_prices_stock_trade_date", "stock_id", "trade_date"),
        Index("ix_daily_prices_trade_date", "trade_date"),
        Index("ix_daily_prices_source", "source"),
        Index("ix_daily_prices_data_quality_flag", "data_quality_flag"),
    )

    stock_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("stocks.id", ondelete="CASCADE"),
        nullable=False,
    )
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    open_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    high_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    low_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    close_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    adjusted_close_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    previous_close_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    price_change: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    price_change_percent: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    day_range: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    day_range_percent: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    vwap: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    volume: Mapped[int] = mapped_column(BigInteger, nullable=False)
    trade_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    turnover: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    data_quality_flag: Mapped[DataQualityFlag] = mapped_column(
        Enum(DataQualityFlag),
        default=DataQualityFlag.OK,
        nullable=False,
    )

    stock = relationship("Stock", back_populates="daily_prices")


class DailyMarketSummary(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "daily_market_summaries"
    __table_args__ = (
        UniqueConstraint(
            "exchange",
            "trade_date",
            "index_name",
            name="uq_daily_market_summaries_exchange_date_index",
        ),
        Index("ix_daily_market_summaries_exchange_trade_date", "exchange", "trade_date"),
    )

    exchange: Mapped[ExchangeCode] = mapped_column(Enum(ExchangeCode), nullable=False)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    index_name: Mapped[str] = mapped_column(String(80), default="GENERAL", nullable=False)
    index_close: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    index_change: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    index_change_percent: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    total_volume: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    total_turnover: Mapped[Decimal | None] = mapped_column(Numeric(24, 4), nullable=True)
    total_trades: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    advancing_issues: Mapped[int | None] = mapped_column(Integer, nullable=True)
    declining_issues: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unchanged_issues: Mapped[int | None] = mapped_column(Integer, nullable=True)
    market_cap: Mapped[Decimal | None] = mapped_column(Numeric(24, 4), nullable=True)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    has_suspicious_prices: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    data_quality_flag: Mapped[DataQualityFlag] = mapped_column(
        Enum(DataQualityFlag),
        default=DataQualityFlag.OK,
        nullable=False,
    )


class StockDetailsSyncJob(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "stock_details_sync_jobs"
    __table_args__ = (
        Index("ix_stock_details_sync_jobs_stock_completed", "stock_id", "completed_at"),
        Index("ix_stock_details_sync_jobs_status_started", "status", "started_at"),
    )

    stock_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("stocks.id", ondelete="CASCADE"),
        nullable=False,
    )
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[StockDetailsSyncJobStatus] = mapped_column(
        Enum(StockDetailsSyncJobStatus),
        nullable=False,
    )
    trigger_type: Mapped[StockDetailsSyncTriggerType] = mapped_column(
        Enum(StockDetailsSyncTriggerType),
        nullable=False,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict, nullable=False)

    stock = relationship("Stock", back_populates="stock_details_sync_jobs")


class FinancialReport(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "financial_reports"
    __table_args__ = (
        UniqueConstraint(
            "stock_id",
            "fiscal_year",
            "period_type",
            "period_end_date",
            "report_status",
            name="uq_financial_reports_stock_period_status",
        ),
        CheckConstraint("fiscal_year >= 1900", name="financial_report_fiscal_year_valid"),
        CheckConstraint(
            "period_end_date >= period_start_date",
            name="financial_report_period_dates_valid",
        ),
        Index(
            "ix_financial_reports_stock_period",
            "stock_id",
            "fiscal_year",
            "period_type",
            "period_end_date",
        ),
        Index("ix_financial_reports_published_date", "published_date"),
        Index("ix_financial_reports_report_status", "report_status"),
    )

    stock_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("stocks.id", ondelete="CASCADE"),
        nullable=False,
    )
    fiscal_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_type: Mapped[ReportPeriodType] = mapped_column(Enum(ReportPeriodType), nullable=False)
    period_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    period_end_date: Mapped[date] = mapped_column(Date, nullable=False)
    published_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    report_status: Mapped[ReportStatus] = mapped_column(Enum(ReportStatus), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="BDT", nullable=False)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    data_quality_flag: Mapped[DataQualityFlag] = mapped_column(
        Enum(DataQualityFlag),
        default=DataQualityFlag.OK,
        nullable=False,
    )
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict, nullable=False)

    stock = relationship("Stock", back_populates="financial_reports")
    metric_values = relationship("FinancialMetricValue", back_populates="financial_report")


class FinancialMetricDefinition(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "financial_metric_definitions"
    __table_args__ = (
        UniqueConstraint("metric_code", name="uq_financial_metric_definitions_metric_code"),
        Index("ix_financial_metric_definitions_active", "is_active"),
    )

    metric_code: Mapped[str] = mapped_column(String(64), nullable=False)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    value_type: Mapped[MetricValueType] = mapped_column(Enum(MetricValueType), nullable=False)
    statement_section: Mapped[str | None] = mapped_column(String(80), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    metric_values = relationship("FinancialMetricValue", back_populates="metric_definition")


class FinancialMetricValue(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "financial_metric_values"
    __table_args__ = (
        UniqueConstraint(
            "financial_report_id",
            "metric_definition_id",
            "as_of_date",
            name="uq_financial_metric_values_report_metric_as_of",
        ),
        Index("ix_financial_metric_values_report", "financial_report_id"),
        Index(
            "ix_financial_metric_values_metric_as_of",
            "metric_definition_id",
            "as_of_date",
        ),
        Index("ix_financial_metric_values_as_of_date", "as_of_date"),
    )

    financial_report_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("financial_reports.id", ondelete="CASCADE"),
        nullable=False,
    )
    metric_definition_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("financial_metric_definitions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    as_of_date: Mapped[date] = mapped_column(Date, nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(24, 6), nullable=False)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    source_value: Mapped[str | None] = mapped_column(String(120), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict, nullable=False)

    financial_report = relationship("FinancialReport", back_populates="metric_values")
    metric_definition = relationship("FinancialMetricDefinition", back_populates="metric_values")


class DividendEvent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "dividend_events"
    __table_args__ = (
        UniqueConstraint(
            "stock_id",
            "fiscal_year",
            "declaration_date",
            name="uq_dividend_events_stock_year_declaration",
        ),
        CheckConstraint("fiscal_year >= 1900", name="dividend_event_fiscal_year_valid"),
        CheckConstraint(
            "cash_dividend_percent IS NULL OR cash_dividend_percent >= 0",
            name="cash_dividend_percent_non_negative",
        ),
        CheckConstraint(
            "stock_dividend_percent IS NULL OR stock_dividend_percent >= 0",
            name="stock_dividend_percent_non_negative",
        ),
        CheckConstraint(
            "cash_amount_per_share IS NULL OR cash_amount_per_share >= 0",
            name="cash_amount_per_share_non_negative",
        ),
        Index("ix_dividend_events_stock_year", "stock_id", "fiscal_year"),
        Index("ix_dividend_events_record_date", "record_date"),
        Index("ix_dividend_events_dividend_type", "dividend_type"),
    )

    stock_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("stocks.id", ondelete="CASCADE"),
        nullable=False,
    )
    fiscal_year: Mapped[int] = mapped_column(Integer, nullable=False)
    dividend_type: Mapped[DividendType] = mapped_column(Enum(DividendType), nullable=False)
    declaration_date: Mapped[date] = mapped_column(Date, nullable=False)
    record_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    ex_dividend_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    cash_dividend_percent: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    stock_dividend_percent: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    cash_amount_per_share: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    status: Mapped[DividendStatus] = mapped_column(Enum(DividendStatus), nullable=False)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict, nullable=False)

    stock = relationship("Stock", back_populates="dividend_events")


class ShareholdingSnapshot(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "shareholding_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "stock_id",
            "snapshot_date",
            "source",
            name="uq_shareholding_snapshots_stock_date_source",
        ),
        CheckConstraint(
            "sponsor_director_percent IS NULL OR "
            "(sponsor_director_percent >= 0 AND sponsor_director_percent <= 100)",
            name="sponsor_director_percent_between_zero_and_one_hundred",
        ),
        CheckConstraint(
            "government_percent IS NULL OR (government_percent >= 0 AND government_percent <= 100)",
            name="government_percent_between_zero_and_one_hundred",
        ),
        CheckConstraint(
            "institution_percent IS NULL OR (institution_percent >= 0 AND institution_percent <= 100)",
            name="institution_percent_between_zero_and_one_hundred",
        ),
        CheckConstraint(
            "foreign_percent IS NULL OR (foreign_percent >= 0 AND foreign_percent <= 100)",
            name="foreign_percent_between_zero_and_one_hundred",
        ),
        CheckConstraint(
            "public_percent IS NULL OR (public_percent >= 0 AND public_percent <= 100)",
            name="public_percent_between_zero_and_one_hundred",
        ),
        CheckConstraint(
            "free_float_percent IS NULL OR (free_float_percent >= 0 AND free_float_percent <= 100)",
            name="free_float_percent_between_zero_and_one_hundred",
        ),
        CheckConstraint("total_shares IS NULL OR total_shares >= 0", name="total_shares_non_negative"),
        CheckConstraint(
            "circulating_shares IS NULL OR circulating_shares >= 0",
            name="circulating_shares_non_negative",
        ),
        Index("ix_shareholding_snapshots_stock_date", "stock_id", "snapshot_date"),
        Index("ix_shareholding_snapshots_snapshot_date", "snapshot_date"),
    )

    stock_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("stocks.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    sponsor_director_percent: Mapped[Decimal | None] = mapped_column(Numeric(7, 4), nullable=True)
    government_percent: Mapped[Decimal | None] = mapped_column(Numeric(7, 4), nullable=True)
    institution_percent: Mapped[Decimal | None] = mapped_column(Numeric(7, 4), nullable=True)
    foreign_percent: Mapped[Decimal | None] = mapped_column(Numeric(7, 4), nullable=True)
    public_percent: Mapped[Decimal | None] = mapped_column(Numeric(7, 4), nullable=True)
    total_shares: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    circulating_shares: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    free_float_percent: Mapped[Decimal | None] = mapped_column(Numeric(7, 4), nullable=True)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    data_quality_flag: Mapped[DataQualityFlag] = mapped_column(
        Enum(DataQualityFlag),
        default=DataQualityFlag.OK,
        nullable=False,
    )
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict, nullable=False)

    stock = relationship("Stock", back_populates="shareholding_snapshots")


class ValuationSnapshot(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "valuation_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "stock_id",
            "valuation_date",
            "source",
            name="uq_valuation_snapshots_stock_date_source",
        ),
        CheckConstraint("close_price IS NULL OR close_price >= 0", name="valuation_close_price_non_negative"),
        CheckConstraint("market_cap IS NULL OR market_cap >= 0", name="valuation_market_cap_non_negative"),
        CheckConstraint(
            "dividend_yield IS NULL OR dividend_yield >= 0",
            name="valuation_dividend_yield_non_negative",
        ),
        Index("ix_valuation_snapshots_stock_date", "stock_id", "valuation_date"),
        Index("ix_valuation_snapshots_valuation_date", "valuation_date"),
    )

    stock_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("stocks.id", ondelete="CASCADE"),
        nullable=False,
    )
    valuation_date: Mapped[date] = mapped_column(Date, nullable=False)
    close_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    market_cap: Mapped[Decimal | None] = mapped_column(Numeric(24, 4), nullable=True)
    pe_ratio: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    pb_ratio: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    dividend_yield: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    earnings_yield: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    price_to_sales: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    data_quality_flag: Mapped[DataQualityFlag] = mapped_column(
        Enum(DataQualityFlag),
        default=DataQualityFlag.OK,
        nullable=False,
    )
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict, nullable=False)

    stock = relationship("Stock", back_populates="valuation_snapshots")


class CorporateAction(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "corporate_actions"
    __table_args__ = (
        UniqueConstraint(
            "stock_id",
            "action_type",
            "action_subtype",
            "announcement_date",
            "effective_date",
            name="uq_corporate_actions_stock_type_announcement_effective",
        ),
        CheckConstraint(
            "ratio_numerator IS NULL OR ratio_numerator >= 0",
            name="corporate_action_ratio_numerator_non_negative",
        ),
        CheckConstraint(
            "ratio_denominator IS NULL OR ratio_denominator > 0",
            name="corporate_action_ratio_denominator_positive",
        ),
        CheckConstraint(
            "cash_amount_per_share IS NULL OR cash_amount_per_share >= 0",
            name="corporate_action_cash_amount_per_share_non_negative",
        ),
        Index("ix_corporate_actions_stock_effective_date", "stock_id", "effective_date"),
        Index("ix_corporate_actions_action_type_date", "action_type", "announcement_date"),
        Index("ix_corporate_actions_action_subtype_date", "action_subtype", "announcement_date"),
    )

    stock_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("stocks.id", ondelete="CASCADE"),
        nullable=False,
    )
    action_type: Mapped[CorporateActionType] = mapped_column(Enum(CorporateActionType), nullable=False)
    action_subtype: Mapped[CorporateActionSubtype] = mapped_column(
        Enum(CorporateActionSubtype),
        nullable=False,
    )
    announcement_date: Mapped[date] = mapped_column(Date, nullable=False)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    record_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    ratio_numerator: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    ratio_denominator: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    cash_amount_per_share: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict, nullable=False)

    stock = relationship("Stock", back_populates="corporate_actions")


class MarketEvent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "market_events"
    __table_args__ = (
        UniqueConstraint(
            "stock_id",
            "event_date",
            "title",
            "source",
            name="uq_market_events_stock_date_title_source",
        ),
        Index("ix_market_events_stock_date", "stock_id", "event_date"),
        Index("ix_market_events_exchange_date", "exchange", "event_date"),
        Index("ix_market_events_type_date", "event_type", "event_date"),
        Index("ix_market_events_source_url", "source_url"),
    )

    stock_id: Mapped[UUID | None] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("stocks.id", ondelete="CASCADE"),
        nullable=True,
    )
    exchange: Mapped[ExchangeCode | None] = mapped_column(Enum(ExchangeCode), nullable=True)
    event_type: Mapped[MarketEventType] = mapped_column(Enum(MarketEventType), nullable=False)
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sentiment_score: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict, nullable=False)

    stock = relationship("Stock", back_populates="market_events")


class TechnicalIndicator(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "technical_indicators"
    __table_args__ = (
        UniqueConstraint(
            "stock_id",
            "trade_date",
            "indicator_type",
            "period",
            name="uq_technical_indicators_stock_date_type_period",
        ),
        Index(
            "ix_technical_indicators_lookup",
            "stock_id",
            "indicator_type",
            "period",
            "trade_date",
        ),
    )

    stock_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("stocks.id", ondelete="CASCADE"),
        nullable=False,
    )
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    indicator_type: Mapped[IndicatorType] = mapped_column(Enum(IndicatorType), nullable=False)
    period: Mapped[int] = mapped_column(Integer, nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    normalized_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    signal_score: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict, nullable=False)

    stock = relationship("Stock", back_populates="technical_indicators")


class TradingSignal(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "trading_signals"
    __table_args__ = (
        UniqueConstraint("stock_id", "trade_date", "strategy_name", name="uq_signals_stock_date_strategy"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="confidence_between_zero_and_one"),
        Index("ix_trading_signals_stock_trade_date", "stock_id", "trade_date"),
        Index("ix_trading_signals_type_trade_date", "signal_type", "trade_date"),
    )

    stock_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("stocks.id", ondelete="CASCADE"),
        nullable=False,
    )
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    signal_type: Mapped[SignalType] = mapped_column(Enum(SignalType), nullable=False)
    confidence: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    momentum_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    trend_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    volume_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    risk_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    strategy_name: Mapped[str] = mapped_column(String(120), nullable=False)
    components: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    stock = relationship("Stock", back_populates="trading_signals")

