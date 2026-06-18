from app.modules.stock_details.decision.sector_intelligence import (
    build_comparative_snapshot,
    build_sector_ranks,
    resolve_sector_trend_window,
)
from uuid import uuid4


def test_build_sector_ranks_limits_to_three() -> None:
    stock_id = uuid4()
    peer_ids = [uuid4() for _ in range(5)]
    sector_ids = [stock_id, *peer_ids]

    ranks = build_sector_ranks(
        stock_id=stock_id,
        sector_stock_ids=sector_ids,
        market_caps={stock_id: 1000.0, **{peer: float(index) for index, peer in enumerate(peer_ids, start=1)}},
        dividend_yields={sid: float(index) for index, sid in enumerate(sector_ids, start=1)},
        pe_ratios={sid: float(index) for index, sid in enumerate(sector_ids, start=1)},
    )

    assert len(ranks) == 3
    assert ranks[0].key == "market_cap"


def test_resolve_sector_trend_window_prefers_5d_when_coverage_is_high() -> None:
    stock_ids = [uuid4(), uuid4(), uuid4(), uuid4()]
    changes_5d = {stock_ids[0]: 1.0, stock_ids[1]: 2.0, stock_ids[2]: -1.0, stock_ids[3]: None}
    changes_20d = {stock_id: 0.5 for stock_id in stock_ids}

    window, active = resolve_sector_trend_window(stock_ids, changes_5d, changes_20d)

    assert window == "5d"
    assert active == changes_5d


def test_build_comparative_snapshot_has_four_metrics() -> None:
    snapshot = build_comparative_snapshot(
        stock_pe=12.0,
        stock_pb=1.2,
        stock_dividend_yield=4.0,
        stock_eps_growth=8.0,
        sector_pe_values=[14.0, 16.0, 18.0],
        sector_pb_values=[1.4, 1.6, 1.8],
        sector_yield_values=[3.0, 4.0, 5.0],
        sector_eps_growth_values=[5.0, 6.0, 7.0],
        market_pe_values=[15.0, 17.0],
        market_pb_values=[1.5, 1.7],
        market_yield_values=[2.5, 3.5],
        market_eps_growth_values=[4.0, 5.0],
    )

    assert len(snapshot) == 4
    assert snapshot[0].label == "P/E"
    assert snapshot[0].sector_median == 16.0
