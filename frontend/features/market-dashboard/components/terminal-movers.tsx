"use client";

import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import type { TerminalCopy } from "@/features/market-dashboard/terminal-copy";
import type { MarketDashboardModel } from "@/features/market-dashboard/types/market-dashboard-types";

const tabs = ["gainers", "losers", "turnoverLeaders"] as const;

export function TerminalMovers({ movers, copy, loading }: { movers: MarketDashboardModel["movers"]; copy: TerminalCopy; loading: boolean }) {
  const [selected, select] = useState<(typeof tabs)[number]>("turnoverLeaders");
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : null;
    if (next === null) return;
    event.preventDefault();
    select(tabs[next]);
    tabRefs.current[next]?.focus();
  }

  return <section className="sw-movers" aria-labelledby={`${id}-title`}>
    <div data-guide="market-discovery">
      <h2 className="sw-section-title" id={`${id}-title`}>{copy.movers}</h2>
      <div className="sw-mover-tabs" role="tablist" aria-labelledby={`${id}-title`}>
        {tabs.map((tab, index) => <button
          key={tab} ref={(node) => { tabRefs.current[index] = node; }}
          role="tab" id={`${id}-${tab}`} aria-controls={`${id}-${tab}-panel`} aria-selected={tab === selected}
          tabIndex={tab === selected ? 0 : -1} onClick={() => select(tab)} onKeyDown={(event) => handleTabKey(event, index)} type="button"
        >{copy[tab]}</button>)}
      </div>
    </div>
    {tabs.map((tab) => <div key={tab} hidden={tab !== selected} id={`${id}-${tab}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} tabIndex={0} aria-busy={loading}>
      {tab === selected ? loading ? <p className="sw-state" role="status">{copy.loading}</p>
        : movers[tab].length ? <table className="sw-mover-table">
          <thead><tr><th scope="col">{copy.stock}</th><th scope="col">{copy.change}</th><th scope="col">{copy.turnover}</th></tr></thead>
          <tbody>{movers[tab].map((mover) => <tr key={mover.stockId}>
            <th scope="row"><Link href={mover.href} prefetch={false} title={mover.name}>{mover.symbol}</Link></th>
            <td className={`sw-${mover.tone}`}>{mover.changePercent === "N/A" ? "—" : mover.changePercent}</td>
            <td>{mover.turnover === "N/A" ? "—" : `BDT ${mover.turnover}`}</td>
          </tr>)}</tbody>
        </table> : <p className="sw-state">{copy.moversEmpty}</p> : null}
    </div>)}
  </section>;
}
