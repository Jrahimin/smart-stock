from decimal import Decimal
from uuid import UUID

from fastapi import Depends

from app.api.dependencies.auth_dependencies import get_current_user
from app.core.security_config import UserContext
from app.models import MoneySnapshot, MoneySnapshotAsset, MoneySnapshotLiability, WealthScenario
from app.modules.wealth.wealth_comparison_service import WealthComparisonService
from app.modules.wealth.wealth_calculation_service import WealthCalculationService
from app.modules.wealth.wealth_guide_service import WealthGuideService
from app.modules.wealth.wealth_schemas import (
    MoneySnapshotPatch,
    MoneySnapshotRead,
    WealthComparisonEvaluateRequest,
    WealthComparisonEvaluateResponse,
    WealthDashboardRead,
    WealthGoalRead,
    WealthScenarioCreate,
    WealthScenarioRead,
    WealthSeasonalContextRead,
    WealthToolCalculateRequest,
    WealthToolCalculateResponse,
)
from app.modules.wealth.wealth_snapshot_repository import WealthSnapshotRepository, get_wealth_snapshot_repository


class WealthService:
    def __init__(
        self,
        repository: WealthSnapshotRepository,
        user_context: UserContext,
        calculation_service: WealthCalculationService | None = None,
        comparison_service: WealthComparisonService | None = None,
        guide_service: WealthGuideService | None = None,
    ) -> None:
        self.repository = repository
        self.user_context = user_context
        self.calculation_service = calculation_service or WealthCalculationService()
        self.comparison_service = comparison_service or WealthComparisonService()
        self.guide_service = guide_service or WealthGuideService()

    def _user_id(self) -> UUID:
        return UUID(self.user_context.user_id)

    async def calculate_tool(self, tool_slug: str, payload: WealthToolCalculateRequest) -> WealthToolCalculateResponse:
        return self.calculation_service.calculate(tool_slug, payload.inputs, payload.assumptions)

    async def evaluate_comparison(
        self,
        comparison_slug: str,
        payload: WealthComparisonEvaluateRequest,
    ) -> WealthComparisonEvaluateResponse:
        return self.comparison_service.evaluate(comparison_slug, payload)

    async def get_seasonal_context(self) -> WealthSeasonalContextRead:
        data = self.guide_service.get_seasonal_context()
        return WealthSeasonalContextRead.model_validate(data)

    async def get_or_create_snapshot(self) -> MoneySnapshot:
        snapshot = await self.repository.get_snapshot_for_user(self._user_id())
        if snapshot is None:
            snapshot = await self.repository.create_snapshot(self._user_id())
            snapshot = await self.repository.get_snapshot_for_user(self._user_id())
        return snapshot

    async def get_snapshot(self) -> MoneySnapshotRead:
        snapshot = await self.get_or_create_snapshot()
        return MoneySnapshotRead.model_validate(snapshot)

    async def patch_snapshot(self, payload: MoneySnapshotPatch) -> MoneySnapshotRead:
        snapshot = await self.get_or_create_snapshot()

        if payload.country_code is not None:
            snapshot.country_code = payload.country_code
        if payload.currency is not None:
            snapshot.currency = payload.currency
        if payload.monthly_savings is not None:
            snapshot.monthly_savings = payload.monthly_savings
        if payload.primary_goal is not None:
            snapshot.primary_goal = payload.primary_goal

        if payload.assets is not None:
            assets = [
                MoneySnapshotAsset(
                    snapshot_id=snapshot.id,
                    category=item.category,
                    label=item.label,
                    value=item.value,
                    currency=item.currency,
                    liquidity_tier=item.liquidity_tier,
                    metadata_json=item.metadata,
                )
                for item in payload.assets
            ]
            await self.repository.replace_assets(snapshot, assets)

        if payload.liabilities is not None:
            liabilities = [
                MoneySnapshotLiability(
                    snapshot_id=snapshot.id,
                    category=item.category,
                    label=item.label,
                    balance=item.balance,
                    interest_rate=item.interest_rate,
                    monthly_emi=item.monthly_emi,
                    remaining_months=item.remaining_months,
                    metadata_json=item.metadata,
                )
                for item in payload.liabilities
            ]
            await self.repository.replace_liabilities(snapshot, liabilities)

        snapshot = await self.repository.save_snapshot(snapshot)
        totals = self._compute_totals(snapshot)
        await self.repository.record_history(
            snapshot_id=snapshot.id,
            net_worth=totals["net_worth"],
            total_assets=totals["total_assets"],
            total_liabilities=totals["total_liabilities"],
            summary_json={"monthly_savings": str(snapshot.monthly_savings) if snapshot.monthly_savings else None},
        )
        refreshed = await self.repository.get_snapshot_for_user(self._user_id())
        if refreshed is None:
            refreshed = snapshot
        return MoneySnapshotRead.model_validate(refreshed)

    async def save_scenario(self, payload: WealthScenarioCreate) -> WealthScenarioRead:
        scenario = WealthScenario(
            user_id=self._user_id(),
            scenario_type=payload.scenario_type,
            slug=payload.slug,
            title=payload.title,
            input_json=payload.input_json,
            output_json=payload.output_json,
        )
        created = await self.repository.create_scenario(scenario)
        return WealthScenarioRead.model_validate(created)

    async def get_dashboard(self) -> WealthDashboardRead:
        snapshot = await self.get_or_create_snapshot()
        goals = await self.repository.list_goals(self._user_id())
        scenarios = await self.repository.list_scenarios(self._user_id())
        totals = self._compute_totals(snapshot)
        asset_mix = self._build_asset_mix(snapshot)
        clarity_score = self._compute_clarity_score(snapshot, scenarios)
        passive_income_estimate = self._estimate_passive_income(snapshot)

        insights = self.guide_service.build_dashboard_insights(
            snapshot=snapshot,
            goals=goals,
            net_worth=totals["net_worth"],
            total_assets=totals["total_assets"],
            total_liabilities=totals["total_liabilities"],
            monthly_savings=snapshot.monthly_savings,
        )

        return WealthDashboardRead(
            net_worth=totals["net_worth"],
            total_assets=totals["total_assets"],
            total_liabilities=totals["total_liabilities"],
            monthly_savings=snapshot.monthly_savings,
            passive_income_estimate=passive_income_estimate,
            clarity_score=clarity_score,
            asset_mix=asset_mix,
            goals=[WealthGoalRead.model_validate(goal) for goal in goals],
            saved_scenarios=[WealthScenarioRead.model_validate(scenario) for scenario in scenarios],
            insights=insights,
        )

    def _compute_totals(self, snapshot: MoneySnapshot) -> dict[str, Decimal]:
        total_assets = sum((asset.value for asset in snapshot.assets), Decimal("0"))
        total_liabilities = sum((liability.balance for liability in snapshot.liabilities), Decimal("0"))
        return {
            "total_assets": total_assets.quantize(Decimal("0.01")),
            "total_liabilities": total_liabilities.quantize(Decimal("0.01")),
            "net_worth": (total_assets - total_liabilities).quantize(Decimal("0.01")),
        }

    def _build_asset_mix(self, snapshot: MoneySnapshot) -> list[dict[str, str | Decimal]]:
        totals: dict[str, Decimal] = {}
        for asset in snapshot.assets:
            key = asset.category.value
            totals[key] = totals.get(key, Decimal("0")) + asset.value
        return [{"category": key, "value": value.quantize(Decimal("0.01"))} for key, value in totals.items()]

    def _compute_clarity_score(self, snapshot: MoneySnapshot, scenarios: list[WealthScenario]) -> int:
        score = 0
        if snapshot.monthly_savings is not None:
            score += 10
        if snapshot.assets:
            score += 25
        if snapshot.liabilities:
            score += 10
        optional_asset_fields = sum(self._count_useful_asset_context(asset) for asset in snapshot.assets)
        optional_liability_fields = sum(self._count_useful_liability_context(liability) for liability in snapshot.liabilities)
        score += min(optional_asset_fields * 5 + optional_liability_fields * 5, 30)
        if snapshot.primary_goal is not None:
            score += 20
        if scenarios:
            score += 15
        return min(score, 100)

    def _estimate_passive_income(self, snapshot: MoneySnapshot) -> Decimal | None:
        income = Decimal("0")
        for asset in snapshot.assets:
            if asset.category.value == "DEPOSIT":
                monthly_profit = asset.metadata_json.get("monthly_profit")
                if monthly_profit is not None:
                    income += Decimal(str(monthly_profit))
                else:
                    distribution = str(asset.metadata_json.get("profit_distribution") or "maturity")
                    if distribution == "maturity":
                        continue
                    rate = Decimal(str(asset.metadata_json.get("interest_rate") or "9"))
                    income += asset.value * rate / Decimal("1200")
            if asset.category.value == "SANCHAYAPATRA":
                monthly_profit = asset.metadata_json.get("monthly_profit")
                if monthly_profit is not None:
                    income += Decimal(str(monthly_profit))
                else:
                    distribution = str(asset.metadata_json.get("profit_distribution") or "monthly")
                    if distribution == "maturity":
                        continue
                    rate = Decimal(str(asset.metadata_json.get("interest_rate") or "11.52"))
                    income += asset.value * rate / Decimal("1200")
        if income <= 0:
            return None
        return income.quantize(Decimal("0.01"))

    def _count_useful_asset_context(self, asset: MoneySnapshotAsset) -> int:
        fields = (
            "interest_rate",
            "start_date",
            "purchase_date",
            "maturity_date",
            "certificate_type",
            "profit_distribution",
            "account_identifier",
            "deposit_type",
            "notes",
        )
        return sum(1 for field in fields if asset.metadata_json.get(field))

    def _count_useful_liability_context(self, liability: MoneySnapshotLiability) -> int:
        direct_count = sum(
            1
            for value in (liability.interest_rate, liability.monthly_emi, liability.remaining_months)
            if value is not None
        )
        metadata_count = sum(1 for field in ("start_date", "account_identifier", "notes") if liability.metadata_json.get(field))
        return direct_count + metadata_count


def get_wealth_service(
    repository: WealthSnapshotRepository = Depends(get_wealth_snapshot_repository),
    user_context: UserContext = Depends(get_current_user),
) -> WealthService:
    return WealthService(repository, user_context)
