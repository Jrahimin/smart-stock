from dataclasses import dataclass

from app.core.enums import AdminConfigCategory, ConfigValueType


@dataclass(frozen=True)
class SafeOperationalSettingDefinition:
    key: str
    value_type: ConfigValueType
    category: AdminConfigCategory
    description: str
    default_attr: str
    requires_restart: bool = False


SAFE_OPERATIONAL_SETTINGS: tuple[SafeOperationalSettingDefinition, ...] = (
    SafeOperationalSettingDefinition(
        key="market_snapshot_scheduler_enabled",
        value_type=ConfigValueType.BOOLEAN,
        category=AdminConfigCategory.SYSTEM,
        description="Enable intraday market snapshot scheduler",
        default_attr="market_snapshot_scheduler_enabled",
        requires_restart=True,
    ),
    SafeOperationalSettingDefinition(
        key="daily_market_sync_scheduler_enabled",
        value_type=ConfigValueType.BOOLEAN,
        category=AdminConfigCategory.SYSTEM,
        description="Enable daily market sync scheduler",
        default_attr="daily_market_sync_scheduler_enabled",
        requires_restart=True,
    ),
    SafeOperationalSettingDefinition(
        key="market_open_time",
        value_type=ConfigValueType.STRING,
        category=AdminConfigCategory.MARKET,
        description="Market open time in Asia/Dhaka (HH:MM)",
        default_attr="market_open_time",
    ),
    SafeOperationalSettingDefinition(
        key="market_close_time",
        value_type=ConfigValueType.STRING,
        category=AdminConfigCategory.MARKET,
        description="Market close time in Asia/Dhaka (HH:MM)",
        default_attr="market_close_time",
    ),
    SafeOperationalSettingDefinition(
        key="market_snapshot_interval_minutes",
        value_type=ConfigValueType.INTEGER,
        category=AdminConfigCategory.MARKET,
        description="Minutes between market snapshot syncs",
        default_attr="market_snapshot_interval_minutes",
    ),
    SafeOperationalSettingDefinition(
        key="daily_market_sync_time",
        value_type=ConfigValueType.STRING,
        category=AdminConfigCategory.MARKET,
        description="Daily market sync time in Asia/Dhaka (HH:MM)",
        default_attr="daily_market_sync_time",
    ),
    SafeOperationalSettingDefinition(
        key="daily_market_stocknow_validation_enabled",
        value_type=ConfigValueType.BOOLEAN,
        category=AdminConfigCategory.SCRAPER,
        description="Enable StockNow validation during market ingestion",
        default_attr="daily_market_stocknow_validation_enabled",
    ),
    SafeOperationalSettingDefinition(
        key="daily_market_stocknow_fallback_enabled",
        value_type=ConfigValueType.BOOLEAN,
        category=AdminConfigCategory.SCRAPER,
        description="Enable StockNow fallback during market ingestion",
        default_attr="daily_market_stocknow_fallback_enabled",
    ),
    SafeOperationalSettingDefinition(
        key="amarstock_news_ingestion_enabled",
        value_type=ConfigValueType.BOOLEAN,
        category=AdminConfigCategory.FEATURE_FLAG,
        description="Enable AmarStock news ingestion during daily sync",
        default_attr="amarstock_news_ingestion_enabled",
    ),
    SafeOperationalSettingDefinition(
        key="amarstock_daily_latest_price_patch_enabled",
        value_type=ConfigValueType.BOOLEAN,
        category=AdminConfigCategory.FEATURE_FLAG,
        description="Enable AmarStock latest price patch during daily sync",
        default_attr="amarstock_daily_latest_price_patch_enabled",
    ),
    SafeOperationalSettingDefinition(
        key="amarstock_index_summary_enabled",
        value_type=ConfigValueType.BOOLEAN,
        category=AdminConfigCategory.FEATURE_FLAG,
        description="Enable AmarStock index summary ingestion",
        default_attr="amarstock_index_summary_enabled",
    ),
    SafeOperationalSettingDefinition(
        key="amarstock_latest_price_stock_details_enabled",
        value_type=ConfigValueType.BOOLEAN,
        category=AdminConfigCategory.FEATURE_FLAG,
        description="Enable AmarStock latest price enrichment for stock details",
        default_attr="amarstock_latest_price_stock_details_enabled",
    ),
)

SAFE_OPERATIONAL_SETTING_KEYS = {definition.key for definition in SAFE_OPERATIONAL_SETTINGS}
