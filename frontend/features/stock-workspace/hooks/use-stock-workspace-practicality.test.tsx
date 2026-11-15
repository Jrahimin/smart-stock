/** @vitest-environment jsdom */
import React, { type ReactNode } from "react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useStockWorkspace } from "./use-stock-workspace";
import fixture from "@/test-fixtures/practicality-controlled-close.json";

afterEach(()=>{cleanup();onlineManager.setOnline(true);vi.unstubAllGlobals();vi.useRealTimers();});
const assessed=Date.parse(fixture.workspace.decision_support.entry_applicability.assessed_at);
async function settle(){for(let i=0;i<8;i++)await act(async()=>{await vi.advanceTimersByTimeAsync(10);});}
function setup(){
  vi.useFakeTimers();vi.setSystemTime(assessed+60_000);
  const state={workspace:structuredClone(fixture.workspace),freshness:structuredClone(fixture.freshness),pauseFreshness:false,
    resolveFreshness:null as null|(()=>void),ownerReads:0,freshnessReads:0};
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>{
    const path=new URL(url).pathname;
    if(path.endsWith("/market/freshness")){
      state.freshnessReads++;
      if(state.pauseFreshness)await new Promise<void>(resolve=>{state.resolveFreshness=resolve;});
      return new Response(JSON.stringify({success:true,data:state.freshness}),{status:200});
    }
    if(path.endsWith("/BSRMSTEEL/workspace")){
      state.ownerReads++;return new Response(JSON.stringify({success:true,data:state.workspace}),{status:200});
    }
    throw new Error("Unexpected API path "+path);
  }));
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
  const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook=renderHook(()=>useStockWorkspace({exchange:"DSE",symbol:"BSRMSTEEL"}),{wrapper});
  return {state,client,...hook};
}

it("cold-loads real serialized LAST_CLOSE and releases resume only after both successful reads, with unchanged old assessment",async()=>{
  const hook=setup();await settle();
  expect(hook.result.current.loadState).toBe("loaded");
  expect(hook.result.current.decisionRaw?.entry_applicability?.status).toBe("APPLICABLE");
  expect(hook.result.current.decisionRaw?.decision.evidence_status).toBe("BULLISH");
  const ownerBefore=hook.state.ownerReads,freshBefore=hook.state.freshnessReads;
  hook.state.pauseFreshness=true;
  await act(async()=>{window.dispatchEvent(new Event("focus"));});await settle();
  expect(hook.state.ownerReads).toBeGreaterThan(ownerBefore);
  expect(hook.state.freshnessReads).toBeGreaterThan(freshBefore);
  expect(hook.result.current.decisionRaw?.entry_applicability).toBeNull();
  hook.state.pauseFreshness=false;await act(async()=>{hook.state.resolveFreshness?.();});await settle();
  expect(hook.result.current.decisionRaw?.entry_applicability?.status).toBe("APPLICABLE");
  expect(hook.result.current.decisionRaw?.entry_applicability?.assessed_at).toBe(fixture.workspace.decision_support.entry_applicability.assessed_at);
  hook.state.freshness.market_status="OPEN";
  await act(async()=>{window.dispatchEvent(new Event("focus"));});await settle();
  expect(hook.result.current.decisionRaw?.entry_applicability).toBeNull();
});

it.each([false,true])("a rejected future or foreign-owner assessment cannot poison the later genuine closing read (foreign owner=%s)",async(wrongGeneration)=>{
  const hook=setup();await settle();
  expect(hook.result.current.decisionRaw?.entry_applicability?.status).toBe("APPLICABLE");
  const poisoned=structuredClone(fixture.workspace);
  // Deliberately invalid input, not an authored positive: production fence must
  // reject it and it must not become trusted ordering evidence for this owner.
  const invalidTime=wrongGeneration?new Date(assessed+30_000).toISOString():"2026-11-16T05:00:00Z";
  poisoned.decision_support.entry_applicability.assessed_at=invalidTime;
  poisoned.decision_support.decision.entry_applicability.assessed_at=invalidTime;
  if(wrongGeneration)poisoned.decision_generation_id="CONTROLLED-WRONG-OWNER";
  hook.state.workspace=poisoned;
  await act(async()=>{await hook.client.refetchQueries({queryKey:["stock-workspace"]});});await settle();
  expect(hook.result.current.decisionRaw?.entry_applicability).toBeNull();
  hook.state.workspace=structuredClone(fixture.workspace);
  await act(async()=>{await hook.client.refetchQueries({queryKey:["stock-workspace"]});});await settle();
  expect(hook.result.current.decisionRaw?.entry_applicability?.status).toBe("APPLICABLE");
});
