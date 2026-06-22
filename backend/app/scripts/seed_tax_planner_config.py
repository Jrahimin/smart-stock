"""Seed Tax Planner configuration from bangladesh_tax_config defaults.

Usage from the ``backend/`` directory::

    python -m app.scripts.seed_tax_planner_config
"""

import asyncio
import logging
import os
import sys
from decimal import Decimal
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
os.chdir(BACKEND_ROOT)

from app.core.dotenv_loader import load_backend_dotenv

load_backend_dotenv()

logger = logging.getLogger(__name__)


async def seed_tax_planner_config() -> None:
    from sqlalchemy import select

    from app.core.database_session import AsyncSessionLocal
    from app.models import TaxInvestmentCategory, TaxPlannerSettings, TaxPlannerSlab
    from app.modules.wealth.bangladesh_tax_config import (
        MINIMUM_TAX_V1_NOTE,
        TAX_PLANNER_DISCLAIMER,
        get_active_tax_config,
    )
    from app.modules.wealth.tax_config.tax_config_registry import (
        INVESTMENT_CATEGORY_DEFINITIONS,
        INVESTMENT_CATEGORY_SEED_ORDER,
    )

    python_config = get_active_tax_config()

    async with AsyncSessionLocal() as session:
        existing_settings = await session.scalar(
            select(TaxPlannerSettings).where(TaxPlannerSettings.country_code == "BD")
        )
        if existing_settings is None:
            session.add(
                TaxPlannerSettings(
                    country_code="BD",
                    tax_year_label=python_config.tax_year_label,
                    display_name=python_config.display_name,
                    disclaimer=python_config.disclaimer or TAX_PLANNER_DISCLAIMER,
                    minimum_tax_note=python_config.minimum_tax_note or MINIMUM_TAX_V1_NOTE,
                    threshold_general=python_config.thresholds.general,
                    threshold_woman_or_senior=python_config.thresholds.woman_or_senior,
                    threshold_person_with_disability=python_config.thresholds.person_with_disability,
                    threshold_freedom_fighter=python_config.thresholds.freedom_fighter,
                    rebate_max_income_percentage=python_config.investment_rebate.max_income_percentage,
                    rebate_max_amount=python_config.investment_rebate.max_amount,
                    rebate_rate=python_config.investment_rebate.rebate_rate,
                    minimum_tax_national=Decimal("5000"),
                    minimum_tax_dhaka_ctg=Decimal("5000"),
                    minimum_tax_other_city=Decimal("4000"),
                    minimum_tax_rural=Decimal("3000"),
                )
            )
            logger.info("Seeded tax planner settings for %s", python_config.tax_year_label)

        existing_slab = await session.scalar(select(TaxPlannerSlab.id).limit(1))
        if existing_slab is None:
            for index, slab in enumerate(python_config.slabs):
                session.add(
                    TaxPlannerSlab(
                        sort_order=index + 1,
                        band_amount=slab.amount,
                        rate=slab.rate,
                        label=slab.label,
                        is_allowance_band=index == 0,
                    )
                )
            logger.info("Seeded tax slabs")

        existing_categories = await session.scalar(select(TaxInvestmentCategory.id).limit(1))
        if existing_categories is None:
            for index, category_key in enumerate(INVESTMENT_CATEGORY_SEED_ORDER, start=1):
                definition = INVESTMENT_CATEGORY_DEFINITIONS[category_key]
                session.add(
                    TaxInvestmentCategory(
                        category_key=category_key,
                        display_label=definition.default_label,
                        sort_order=index,
                        is_enabled=True,
                    )
                )
            logger.info("Seeded %s investment categories", len(INVESTMENT_CATEGORY_SEED_ORDER))

        await session.commit()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    asyncio.run(seed_tax_planner_config())


if __name__ == "__main__":
    main()
