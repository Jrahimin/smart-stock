from decimal import Decimal

from app.core.enums import ExchangeCode, MarketDataState, PortfolioAttentionCode, PortfolioAttentionSeverity
from app.modules.mail.portfolio_summary_email import build_portfolio_summary_email
from app.modules.portfolios.portfolios_schemas import (
    PortfolioAttentionRead,
    PortfolioPulseRead,
    PortfolioWorkspaceMetaRead,
    PortfolioWorkspaceRead,
)


def _sample_workspace() -> PortfolioWorkspaceRead:
    return PortfolioWorkspaceRead(
        meta=PortfolioWorkspaceMetaRead(
            exchange=ExchangeCode.DSE,
            data_state=MarketDataState.FINALIZED,
            holding_count=2,
        ),
        pulse=PortfolioPulseRead(
            known_current_value=Decimal("2450.00"),
            known_unrealized_gain_amount=Decimal("120.00"),
            known_unrealized_gain_percent=Decimal("5.15"),
            estimated_daily_change_amount=Decimal("35.00"),
            estimated_daily_change_percent=Decimal("1.43"),
            holding_count=2,
        ),
        attention=[
            PortfolioAttentionRead(
                code=PortfolioAttentionCode.INCOMPLETE_HOLDING,
                severity=PortfolioAttentionSeverity.LOW,
                stock_ids=[],
                symbols=["TRUSTBANK", "RENATA"],
                count=2,
            )
        ],
    )


def test_build_portfolio_summary_email_includes_pulse_and_attention_in_english() -> None:
    subject, body, body_html = build_portfolio_summary_email(
        display_name="Rahim",
        workspace=_sample_workspace(),
        portfolio_url="http://localhost:3000/portfolio",
        locale="en",
    )

    assert "Your portfolio summary" in subject
    assert "৳2,450.00" in body
    assert "Incomplete holding information" in body
    assert "TRUSTBANK" in body
    assert "Open My Portfolio" in body_html
    assert 'lang="en"' in body_html


def test_build_portfolio_summary_email_localizes_bangla_copy() -> None:
    subject, body, body_html = build_portfolio_summary_email(
        display_name="Rahim",
        workspace=_sample_workspace(),
        portfolio_url="http://localhost:3000/portfolio",
        locale="bn",
    )

    assert "আপনার পোর্টফোলিও সারাংশ" in subject
    assert "হ্যালো Rahim" in body
    assert "Holding-এর কিছু তথ্য বাকি" in body
    assert "আমার পোর্টফোলিও খুলুন" in body_html
    assert 'lang="bn"' in body_html
