import type { DecisionDisplayAction } from "@/lib/api/backend-api-types";

/** Keep recognizable dated legacy actions; never turn absent/unknown taxonomy into WAIT. */
export function compatibleDisplayAction(decision: { display_action?: string; recommendation?: string; decision_taxonomy_version?: string; canonical?: { decision_taxonomy_version?: string; action_taxonomy?: string } | null } | null | undefined): DecisionDisplayAction | null {
  if (!decision || decision.decision_taxonomy_version && !["v1", "v2"].includes(decision.decision_taxonomy_version)) return null;
  if (decision.canonical?.decision_taxonomy_version && !["v1", "v2"].includes(decision.canonical.decision_taxonomy_version)) return null;
  if (decision.canonical?.action_taxonomy && !["TRADER_RECOMMENDATION_V1", "TRADER_DECISION_V2"].includes(decision.canonical.action_taxonomy)) return null;
  if (["POTENTIAL_BUY", "HOLD", "WAIT", "SELL"].includes(decision.display_action ?? "")) return decision.display_action as DecisionDisplayAction;
  if (decision.decision_taxonomy_version === "v1") {
    if (decision.recommendation === "BUY") return "POTENTIAL_BUY";
    if (["HOLD", "WAIT", "SELL"].includes(decision.recommendation ?? "")) return decision.recommendation as DecisionDisplayAction;
  }
  return null;
}
