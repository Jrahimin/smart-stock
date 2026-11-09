from unittest.mock import AsyncMock

import pytest
from sqlalchemy.dialects import postgresql

from app.core.enums import ExchangeCode
from app.modules.trading_intelligence.decision_snapshot_repository import DecisionSnapshotRepository


@pytest.mark.asyncio
@pytest.mark.parametrize("metadata_only", [True, False])
async def test_publication_projection_avoids_replay_inputs(metadata_only):
    session = AsyncMock()
    await DecisionSnapshotRepository(session).latest_publication(
        exchange=ExchangeCode.DSE, generation_id="current", metadata_only=metadata_only,
    )
    statement = session.scalar.call_args.args[0]
    sql = str(statement.compile(dialect=postgresql.dialect()))
    assert "input_payload" not in sql
    assert ("result_payload" in sql) is not metadata_only
    assert "invalidated_at" in sql
    assert "session_date DESC" in sql
    assert "observed_at DESC" in sql
    assert "CASE WHEN" in sql
