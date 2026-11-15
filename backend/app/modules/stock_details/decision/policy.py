"""Frozen policy dispatch. Shadow arms are explicit offline counterfactuals."""
from dataclasses import dataclass


@dataclass(frozen=True)
class DecisionPolicy:
    corrections: bool = False
    market: bool = False
    risk: bool = False
    rsi: bool = False
    pullback: bool = False
    ranking: bool = False


def decision_policy(version: str) -> DecisionPolicy:
    if version == "trading-intelligence-v3-shadow-market":
        return DecisionPolicy(market=True)
    if version in {"trading-intelligence-v2", "trading-intelligence-v3"}:
        return DecisionPolicy()
    prefix = "trading-intelligence-v4-shadow-"
    arm = version.removeprefix(prefix) if version.startswith(prefix) else ""
    return DecisionPolicy(corrections=True, **{
        key: arm in {key, "combined"}
        for key in ("market", "risk", "rsi", "pullback", "ranking")
    })
