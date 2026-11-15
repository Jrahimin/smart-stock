import type { BackendTopSetupDto } from "@/lib/api/backend-api-types";

/** Delivered server selection, not a client qualification/ranking calculation. */
export function topSetupFixture(overrides: Partial<BackendTopSetupDto> = {}): BackendTopSetupDto {
  return {version:"top-setups-v1",rank:1,readiness:"AWAITING_CONFIRMATION",action:"POTENTIAL_BUY",setup_type:"BREAKOUT",condition:"Close above the trigger with participation",entry_low:98,entry_high:100,trigger_price:98,invalidation:94,target:109,opportunity_score:70,risk_label:"LOW",supporting_fact:"UPTREND",holder_guidance:"HOLD_NO_ADD",...overrides};
}
