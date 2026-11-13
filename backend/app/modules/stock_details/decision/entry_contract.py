"""Explicit, request-scoped rollout for the price evidence contract."""
from contextvars import ContextVar
from typing import Literal

from fastapi import Query

ENTRY_CONTRACT_V2 = "price-basis-v2"
entry_contract: ContextVar[str] = ContextVar("entry_contract", default="legacy")


async def use_entry_contract(
    contract: Literal["legacy", "price-basis-v2"] = Query(default="legacy", alias="entry_contract"),
):
    token = entry_contract.set(contract)
    try:
        yield contract
    finally:
        entry_contract.reset(token)


def price_basis_enabled() -> bool:
    return entry_contract.get() == ENTRY_CONTRACT_V2


def entry_contract_cache_token() -> str:
    return entry_contract.get()
