import { describe,expect,it } from "vitest";
import { marketNewsDateLabel,marketNewsSourceLabel } from "../formatters/trader-formatters";
import { entryContractParams,NEWS_DATE_CONTRACT } from "./entry-contract-capability";
import { dashboardQueryKey } from "../../features/market-dashboard/hooks/dashboard-query-key";
import { mapDashboardAlertsDto } from "../../features/market-dashboard/view-models/dashboard-sections-mapper";

describe("news provenance and cached day labels",()=>{
  it.each(["en","bn"] as const)("uses server Today only in its Dhaka reference day and never for a recorded day (%s)",locale=>{
    const item={time:"2026-11-15",publicationDate:"2026-11-15",dateBasis:"PUBLICATION",dateLabel:"TODAY",dateLabelAsOf:"2026-11-15"};
    expect(marketNewsDateLabel(item,locale,Date.parse("2026-11-15T17:59:59Z"))).toBe(locale==="en"?"Today":"আজ");
    expect(marketNewsDateLabel(item,locale,Date.parse("2026-11-15T18:00:00Z"))).not.toBe(locale==="en"?"Today":"আজ");
    expect(marketNewsDateLabel({...item,dateBasis:"RECORDED_DATE"},locale,Date.parse("2026-11-15T10:00:00Z"))).toContain(locale==="en"?"Recorded":"রেকর্ড");
    expect(marketNewsDateLabel({...item,dateLabel:"DATE"},locale,Date.parse("2026-11-15T10:00:00Z"))).not.toBe(locale==="en"?"Today":"আজ");
  });
  it("opts into recorded semantics on the existing endpoint and separates the query/cache identity",()=>{
    expect(entryContractParams("/dashboard/market-alerts",{exchange:"DSE"})).toEqual({exchange:"DSE",news_contract:NEWS_DATE_CONTRACT});
    expect(dashboardQueryKey("market-alerts","DSE","g")).toContain(NEWS_DATE_CONTRACT);
    expect(entryContractParams("/dashboard/overview",{exchange:"DSE"})).toEqual({exchange:"DSE"});
  });
  it("preserves date evidence and shows a publisher name without changing the API source",()=>{
    const dto={session_trade_date:"2026-11-10",items:[{kind:"NEWS" as const,time:"2026-11-10",title:"Recorded announcement",description:"Source text",source:"AMARSTOCK_NEWS_API",date_basis:"RECORDED_DATE" as const,date_label:"RECORDED_DATE" as const,date_label_as_of:"2026-11-15"}]};
    const row=mapDashboardAlertsDto(dto)[0]!;
    expect(row.dateBasis).toBe("RECORDED_DATE");expect(row.publicationDate).toBeUndefined();
    expect(marketNewsSourceLabel(row.source)).toBe("AmarStock");expect(dto.items[0].source).toBe("AMARSTOCK_NEWS_API");
  });
});
