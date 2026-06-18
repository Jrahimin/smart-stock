from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.core.enums import DividendStatus, DividendType
from app.models import DividendEvent, ShareholdingSnapshot
from app.modules.stock_details.decision.dividend_intelligence import build_dividend_intelligence
from app.modules.stock_details.decision.ownership_trends import build_ownership_trends


def test_build_dividend_intelligence_from_dividend_event() -> None:
    event = DividendEvent(
        id=uuid4(),
        stock_id=uuid4(),
        fiscal_year=2024,
        dividend_type=DividendType.CASH,
        declaration_date=date(2024, 5, 1),
        cash_dividend_percent=Decimal("10"),
        status=DividendStatus.DECLARED,
        source="TEST",
    )

    result = build_dividend_intelligence(dividend_events=[event], market_events=[])

    assert result is not None
    assert result.last_dividend_year == 2024
    assert result.last_dividend_value == "10% cash"


def test_build_ownership_trends_partial_history() -> None:
    snapshot = ShareholdingSnapshot(
        id=uuid4(),
        stock_id=uuid4(),
        snapshot_date=date(2026, 3, 31),
        sponsor_director_percent=Decimal("30"),
        source="TEST",
        metadata_json={
            "indexed_history": [
                {"SponsorDirector": "31", "snapshot_label": "Feb 2026"},
                {"SponsorDirector": "30", "snapshot_label": "Dec 2025"},
            ]
        },
    )

    trends = build_ownership_trends(snapshot)
    sponsor = next(trend for trend in trends if trend.segment_key == "sponsor")

    assert sponsor.coverage_status == "partial"
    assert len(sponsor.points) == 2
