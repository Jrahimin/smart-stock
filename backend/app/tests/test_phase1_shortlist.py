from dataclasses import replace

import pytest

from app.core.enums import (
    DecisionConstraintKind,
    EligibilityStatus,
    EntryReadiness,
    ExchangeCode,
    OpportunityQuality,
)
from app.modules.market_pulse.pulse_score import build_pulse_trigger
from app.modules.market_universe.shortlist import apply_shortlist_ranks
from app.modules.signals.trader_decisions_service import TraderDecisionsService
from app.modules.stock_details.decision.canonical import build_strategy_input_from_prices
from app.modules.stock_details.decision.constraints import ConstraintResult, DecisionConstraint
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.recommendation import compute_recommendation
from app.modules.stock_details.stock_details_decision_service import StockDetailsDecisionService
from app.tests.test_canonical_generation_architecture import (
    _canonical_fixture,
    _CanonicalUniverseDouble,
    _DetailsRepository,
)
from app.tests.test_phase1_finalized_inputs import prices


def test_shortlist_uses_eligibility_readiness_quality_tradability_and_stable_symbol():
    _, _, row, _ = _canonical_fixture()

    def candidate(symbol, readiness, quality, eligible=True, evidence=100):
        item = row.model_copy(deep=True)
        item.stock.symbol = symbol
        from uuid import NAMESPACE_DNS, uuid5

        item.stock.id = uuid5(NAMESPACE_DNS, symbol)
        item.decision.canonical.eligibility_status = (
            EligibilityStatus.ELIGIBLE if eligible else EligibilityStatus.INELIGIBLE
        )
        item.decision.canonical.entry_readiness = EntryReadiness(readiness)
        item.decision.canonical.opportunity_quality = OpportunityQuality(quality)
        item.decision.confidence = evidence
        item.decision.evidence_strength = evidence
        return item

    inputs = [
        candidate("APSCLBOND", "READY", "STRONG", False),
        candidate("BRACBANK", "NOT_READY", "WEAK"),
        candidate("SQURPHARMA", "CONDITIONAL", "STRONG", evidence=1),
        candidate("ENVOYTEX", "READY", "CONSTRUCTIVE", evidence=1),
        candidate("SPCL", "CONDITIONAL", "STRONG", evidence=99),
    ]
    ranks = apply_shortlist_ranks(inputs)
    expected = ["ENVOYTEX", "SPCL", "SQURPHARMA", "BRACBANK", "APSCLBOND"]
    assert [r.stock.symbol for r in sorted(ranks, key=lambda r: r.shortlist.entry_rank)] == expected
    assert {
        r.stock.symbol: r.shortlist.entry_rank
        for r in apply_shortlist_ranks(list(reversed(inputs)))
    } == {symbol: index + 1 for index, symbol in enumerate(expected)}


def test_regime_wait_reports_regime_and_watch_level_cannot_authorize_entry():
    rows = prices()
    bundle = compute_trader_decision(build_strategy_input_from_prices(rows, category="A"))
    constraints = ConstraintResult(
        (
            DecisionConstraint(
                "regime_plan_not_permitted",
                "Regime veto",
                DecisionConstraintKind.BLOCK,
                "Market regime blocks this plan.",
                False,
            ),
        )
    )
    result = compute_recommendation(
        bundle.snapshot,
        bundle.opportunity,
        bundle.risk,
        near_resistance=False,
        below_support=False,
        risk_reward=2,
        is_stale=False,
        is_sparse=False,
        constraints=constraints,
        trading_risk=bundle.trading_risk,
        directional_evidence=bundle.directional_evidence,
    )
    assert result.primary_reason_code == "regime_plan_not_permitted"
    assert result.primary_reason == "Market regime blocks this plan."
    _, _, row, _ = _canonical_fixture()
    row.decision.entry_condition = None
    assert (
        build_pulse_trigger(replace(bundle.snapshot, resistance=58.50), row.decision)
        == "No permitted entry trigger"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("symbol", ["SPCL", "ENVOYTEX", "BRACBANK", "SQURPHARMA", "APSCLBOND"])
async def test_named_fixture_field_intersection_parity(symbol):
    stock, prices, row, snapshot = _canonical_fixture()
    stock.symbol = row.stock.symbol = symbol
    universe = _CanonicalUniverseDouble(snapshot)
    latest = (
        await TraderDecisionsService(universe).list_latest_trader_decisions(
            exchange=ExchangeCode.DSE, limit=10, offset=0, price_window_limit=90
        )
    )[0]
    details = await StockDetailsDecisionService(
        _DetailsRepository(stock, prices), universe
    ).get_decision_support(exchange=ExchangeCode.DSE, symbol=symbol)
    assert latest.decision.canonical == details.canonical_decision == row.decision.canonical
    assert details.trade_plan == row.analysis.trade_plan
    assert details.trading_risk == row.analysis.trading_risk
    assert details.directional_evidence == row.analysis.directional_evidence
    assert details.decision.primary_reason_code == row.decision.primary_reason_code
