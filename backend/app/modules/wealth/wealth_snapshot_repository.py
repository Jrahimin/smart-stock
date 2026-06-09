from decimal import Decimal
from uuid import UUID

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database_session import get_db_session
from app.models import MoneySnapshot, MoneySnapshotAsset, MoneySnapshotHistory, MoneySnapshotLiability, WealthGoal, WealthScenario


class WealthSnapshotRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_snapshot_for_user(self, user_id: UUID) -> MoneySnapshot | None:
        result = await self.session.execute(
            select(MoneySnapshot)
            .options(
                selectinload(MoneySnapshot.assets),
                selectinload(MoneySnapshot.liabilities),
            )
            .where(MoneySnapshot.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def create_snapshot(self, user_id: UUID) -> MoneySnapshot:
        snapshot = MoneySnapshot(user_id=user_id)
        self.session.add(snapshot)
        await self.session.commit()
        await self.session.refresh(snapshot)
        return snapshot

    async def save_snapshot(self, snapshot: MoneySnapshot) -> MoneySnapshot:
        await self.session.commit()
        await self.session.refresh(snapshot)
        return snapshot

    async def replace_assets(self, snapshot: MoneySnapshot, assets: list[MoneySnapshotAsset]) -> None:
        for existing in list(snapshot.assets):
            await self.session.delete(existing)
        snapshot.assets = assets
        await self.session.flush()

    async def replace_liabilities(self, snapshot: MoneySnapshot, liabilities: list[MoneySnapshotLiability]) -> None:
        for existing in list(snapshot.liabilities):
            await self.session.delete(existing)
        snapshot.liabilities = liabilities
        await self.session.flush()

    async def list_goals(self, user_id: UUID) -> list[WealthGoal]:
        result = await self.session.execute(
            select(WealthGoal).where(WealthGoal.user_id == user_id).order_by(WealthGoal.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_scenarios(self, user_id: UUID, *, limit: int = 20) -> list[WealthScenario]:
        result = await self.session.execute(
            select(WealthScenario)
            .where(WealthScenario.user_id == user_id)
            .order_by(WealthScenario.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def create_scenario(self, scenario: WealthScenario) -> WealthScenario:
        self.session.add(scenario)
        await self.session.commit()
        await self.session.refresh(scenario)
        return scenario

    async def record_history(
        self,
        *,
        snapshot_id: UUID,
        net_worth: Decimal,
        total_assets: Decimal,
        total_liabilities: Decimal,
        summary_json: dict,
    ) -> MoneySnapshotHistory:
        history = MoneySnapshotHistory(
            snapshot_id=snapshot_id,
            net_worth=net_worth,
            total_assets=total_assets,
            total_liabilities=total_liabilities,
            summary_json=summary_json,
        )
        self.session.add(history)
        await self.session.commit()
        await self.session.refresh(history)
        return history


def get_wealth_snapshot_repository(session: AsyncSession = Depends(get_db_session)) -> WealthSnapshotRepository:
    return WealthSnapshotRepository(session)
