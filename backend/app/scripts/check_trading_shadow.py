"""Inspect frozen forward receipts; --mature explicitly appends modeled outcome vintages."""
import argparse
import asyncio
import json
from datetime import timedelta


async def run(args):
    from sqlalchemy import text
    from app.core.database_session import AsyncSessionLocal
    from app.core.enums import ExchangeCode
    from app.modules.backtesting.backtesting_shadow import mature_shadow_outcomes, shadow_progress
    from app.modules.backtesting.backtesting_models import BacktestConfig
    from app.modules.backtesting.backtesting_repository import BacktestingRepository
    from app.modules.market_data.market_data_repository import MarketDataRepository
    exchange = ExchangeCode(args.exchange)
    async with AsyncSessionLocal() as session:
        if not args.mature and not args.assess:
            await session.execute(text("SET TRANSACTION READ ONLY"))
        end = await MarketDataRepository(session).get_latest_finalized_session_date(exchange=exchange)
        if (args.mature or args.assess) and end:
            config = BacktestConfig(exchange, end-timedelta(days=365), end, horizons=(10,))
            dataset = await BacktestingRepository(session).load_dataset(config)
            await mature_shadow_outcomes(session, dataset, config)
        if args.assess and end:
            from app.modules.backtesting.backtesting_shadow_assessment import assess_shadow_receipts
            assessment = await assess_shadow_receipts(session, dataset, exchange=exchange)
        report = await shadow_progress(session, exchange=exchange)
        report["data_through"] = str(end)
        if args.assess and end:
            report["formal_assessment"] = assessment
        print(json.dumps(report, indent=2, default=str))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exchange", choices=("DSE", "CSE"), default="DSE")
    parser.add_argument("--mature", action="store_true", help="Append current modeled outcome vintages; selections remain sealed")
    parser.add_argument("--assess", action="store_true", help="Mature then seal the once-only formal assessment at 120 timely dates; never promotes")
    asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    main()
