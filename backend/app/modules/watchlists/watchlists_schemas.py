from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import DecisionDisplayAction
from app.modules.market_universe.market_universe_schemas import TechnicalSnapshotRead
from app.modules.stock_details.stock_details_schemas import TraderDecisionSummaryRead


class UserWatchlistCreate(BaseModel):
    stock_id: UUID


class UserWatchlistUpdate(BaseModel):
    is_holding: bool | None = None
    buy_price: Decimal | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=2000)


class UserWatchlistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    stock_id: UUID
    stock_symbol: str
    is_holding: bool
    buy_price: Decimal | None
    note: str | None
    created_at: datetime
    updated_at: datetime
    unrealized_gain_percent: Decimal | None = None
    has_note: bool = False
    watching_days: int = 0
    watching_label: str = "Added today"
    current_price: Decimal | None = None
    trader_decision: TraderDecisionSummaryRead | None = None
    technical_snapshot: TechnicalSnapshotRead | None = None
    decision_source: str = "UNAVAILABLE"
    contextual_action: DecisionDisplayAction = DecisionDisplayAction.WAIT


class UserWatchlistSummaryRead(BaseModel):
    total_watchlisted: int
    total_holdings: int


class UserWatchlistToggleResult(BaseModel):
    added: bool
    is_watchlisted: bool
    item: UserWatchlistRead | None = None
