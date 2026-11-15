"use client";

import { memo, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { shortTradeDate, marketNewsDateLabel } from "@/lib/formatters/trader-formatters";
import type { TerminalCopy } from "@/features/market-dashboard/terminal-copy";
import type { MarketTimelineItemModel } from "@/features/market-dashboard/types/market-dashboard-types";

type MarketTimelineProps = { items: MarketTimelineItemModel[]; copy: TerminalCopy; loading: boolean; error?: boolean; sessionDate?: string | null };
const safeLink = (value?: string) => value && (/^https?:\/\//i.test(value) || /^\/stocks\/(DSE|CSE)\/[\w.-]+$/.test(value)) ? value : undefined;

export const MarketTimeline = memo(function MarketTimeline({items,copy,loading,error=false,sessionDate}: MarketTimelineProps) {
  const id = useId();
  const [tab,setTab] = useState<"NEWS" | "HIGHLIGHTS">("NEWS");
  const buttons = useRef<Record<"NEWS" | "HIGHLIGHTS",HTMLButtonElement | null>>({NEWS:null,HIGHLIGHTS:null});
  const news = items.filter(item => item.kind === "NEWS" || item.kind === "DISCLOSURE");
  const highlights = items.filter(item => item.kind === "HIGHLIGHT" || item.kind === "mover");
  const changeTab = (next: "NEWS" | "HIGHLIGHTS", focus=false) => { setTab(next); if (focus) buttons.current[next]?.focus(); };
  const tabKey = (event:KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
    event.preventDefault();
    changeTab(event.key === "Home" ? "NEWS" : event.key === "End" ? "HIGHLIGHTS" : tab === "NEWS" ? "HIGHLIGHTS" : "NEWS",true);
  };
  return <section className="sw-timeline news-reference-panel" aria-labelledby={`${id}-title`} aria-busy={loading}>
    <div className="sw-wire-header news-reference-header"><h2 className="sw-section-title" id={`${id}-title`}>News &amp; highlights</h2>
      <div className="news-reference-tabs" role="tablist" aria-label="News and highlights">
        {(["NEWS","HIGHLIGHTS"] as const).map(key => <button key={key} ref={node=>{buttons.current[key]=node;}} id={`${id}-${key}-tab`} type="button" role="tab" aria-selected={tab===key} aria-controls={`${id}-${key}-panel`} tabIndex={tab===key?0:-1} onClick={()=>changeTab(key)} onKeyDown={tabKey}>{key === "NEWS" ? "News" : "Highlights"}<span>{key === "NEWS" ? news.length : highlights.length}</span></button>)}
      </div>
    </div>
    <TimelineFeed items={news} copy={copy} loading={loading} error={error} enabled={tab === "NEWS"} generated={false} panelId={`${id}-NEWS-panel`} tabId={`${id}-NEWS-tab`}/>
    <TimelineFeed items={highlights} copy={copy} loading={loading} error={error} sessionDate={sessionDate} enabled={tab === "HIGHLIGHTS"} generated panelId={`${id}-HIGHLIGHTS-panel`} tabId={`${id}-HIGHLIGHTS-tab`}/>
  </section>;
});

function NewsExcerpt({ text, bn }: { text: string; bn: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  // Keep the teaser short enough to read alongside the other headlines.
  const limit = 86;
  const long = text.length > limit + 8;
  const preview = long ? text.slice(0, limit).replace(/\s+\S*$/, "").trimEnd() : text;
  return <p className="news-reference-excerpt">
    <span id={id}>{expanded ? text : preview}</span>{long && <>
      {expanded ? " " : ""}<button className="news-inline-more" type="button" aria-expanded={expanded}
        aria-controls={id} onClick={() => setExpanded(!expanded)}>
        {expanded ? (bn ? "গুটিয়ে নিন" : "Show less") : (bn ? "… আরও পড়ুন" : "… Read more")}
      </button>
    </>}
  </p>;
}

function TimelineFeed({items,copy,loading,error=false,sessionDate,enabled,generated,panelId,tabId}: MarketTimelineProps & {enabled:boolean;generated:boolean;panelId:string;tabId:string}) {
  const bn = copy.timeline !== "Market timeline";
  const list = useRef<HTMLUListElement>(null);
  const manualScroll = useRef(false);
  const anchor = useRef<{id:string; offset:number} | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const visible = items;
  const identify = (item: MarketTimelineItemModel) => item.id ?? `${item.time}-${item.title}`;
  const activeIndex = Math.max(0, visible.findIndex(item => identify(item) === activeId));
  const active = visible[activeIndex];
  const remember = () => {
    const node = list.current;
    if (!node || !enabled) return;
    const top = node.getBoundingClientRect().top;
    const child = Array.from(node.children).find(child => child.getBoundingClientRect().bottom > top);
    if (child instanceof HTMLElement) {
      anchor.current = {id:child.dataset.eventId!,offset:child.getBoundingClientRect().top-top};
      if (manualScroll.current) {
        const atEnd = node.scrollHeight - node.scrollTop - node.clientHeight <= 2;
        const selected = atEnd ? node.lastElementChild as HTMLElement | null : child;
        setActiveId(selected?.dataset.eventId ?? null);
      }
    }
  };
  useLayoutEffect(() => {
    const node = list.current, old = anchor.current;
    if (!node || !enabled) return;
    const children=Array.from(node.children) as HTMLElement[];
    const child = old && children.find(child => child.dataset.eventId === old.id);
    manualScroll.current=false;
    if (child && old) {
      node.scrollTop += child.getBoundingClientRect().top-node.getBoundingClientRect().top-old.offset;
      if(activeId && !visible.some(item=>identify(item)===activeId))setActiveId(child.dataset.eventId ?? null);
    } else if(old || activeId && !visible.some(item=>identify(item)===activeId)) {
      const surviving=children.find(child=>child.dataset.eventId===activeId);
      node.scrollTop=surviving ? node.scrollTop+surviving.getBoundingClientRect().top-node.getBoundingClientRect().top : 0;
      const next=surviving ?? children[0];
      anchor.current=next ? {id:next.dataset.eventId!,offset:next.getBoundingClientRect().top-node.getBoundingClientRect().top}:null;
      if(!surviving)setActiveId(next?.dataset.eventId ?? null);
    }
  }, [items,enabled]);
  const candidateDate = sessionDate ?? visible.find(item => item.kind === "HIGHLIGHT" || item.kind === "mover")?.time;
  const date = candidateDate && /^\d{4}-\d{2}-\d{2}$/.test(candidateDate) ? candidateDate : null;
  const activeHref = active ? safeLink(active.sourceUrl) ?? safeLink(active.href) : undefined;
  const activeExternal = activeHref?.startsWith("http");
  const groupLabel = (item: MarketTimelineItemModel) => item.dateBasis === "RECORDED_DATE" ? "RECORDED NEWS" : item.kind === "DISCLOSURE" ? "DISCLOSURES" : item.kind === "NEWS" ? "PUBLISHED NEWS" : "SESSION HIGHLIGHTS";
  return <div role="tabpanel" id={panelId} aria-labelledby={tabId} hidden={!enabled} tabIndex={visible.length ? -1 : 0}>
    {visible.length && generated ? <div className="news-reference-feed-head"><p>{date ? <><span>Session · <time dateTime={date}>{shortTradeDate(date, bn ? "bn" : "en")}</time></span><span aria-hidden="true"> · </span></> : null}<span>{bn ? "বাজারের তথ্য থেকে" : "Generated from session data"}</span></p></div> : null}
    {loading ? <p className="sw-state" role="status">{copy.loading}</p> : error && !visible.length ? <p className="sw-state sw-warning" role="status">{copy.timelineError}</p> : visible.length ? <>
      <ul ref={list} className="sw-timeline-list session-news-scroll news-reference-list" tabIndex={0} aria-label={generated ? (bn ? "সেশনের Highlights; আরও দেখতে স্ক্রল করুন" : "Session highlights; scroll for more") : (bn ? "খবর; আরও দেখতে স্ক্রল করুন" : "News; scroll for more")} onScroll={remember}
        onFocusCapture={remember}
        onWheel={() => { manualScroll.current = true; }} onTouchStart={() => { manualScroll.current = true; }} onPointerDown={() => { manualScroll.current = true; }} onKeyDown={event => { if (["ArrowDown","ArrowUp","PageDown","PageUp","Home","End"," "].includes(event.key)) { manualScroll.current = true; } }}>
        {visible.map((item,index) => {
          const published = item.kind === "NEWS" || item.kind === "DISCLOSURE";
          const typed = !published && item.symbol && item.metricValue != null && Number.isFinite(item.metricValue) && (item.metricUnit === "PERCENT" || item.metricUnit === "BDT");
          const value = item.metricValue;
          const label = typed && item.highlightType === "TURNOVER_LEADER" ? `${item.symbol} ${bn ? "turnover-এ এগিয়ে" : "leads turnover"}`
            : typed && item.highlightType === "PRICE_LEADER" ? `${item.symbol} ${value! > 0 ? (bn ? "দাম বৃদ্ধিতে এগিয়ে" : "leads gains") : (bn ? "দামের পরিবর্তনে এগিয়ে" : "price-change leader")}`
            : typed && item.highlightType === "PRICE_LAGGARD" ? `${item.symbol} ${value! < 0 ? (bn ? "দাম কমেছে" : "declines") : value! > 0 ? (bn ? "তুলনায় কম বেড়েছে" : "smallest gain") : (bn ? "দাম অপরিবর্তিত" : "price unchanged")}` : item.title;
          const metric = typed ? item.metricUnit === "PERCENT" ? `${value! > 0 ? "+" : ""}${value!.toFixed(2)}%` : `৳${value! >= 1_000_000_000 ? `${(value!/1_000_000_000).toFixed(1)}B` : value! >= 1_000_000 ? `${(value!/1_000_000).toFixed(1)}M` : value!.toLocaleString("en-GB")}` : null;
          const tone = item.metricUnit === "PERCENT" && value != null ? value > 0 ? "positive" : value < 0 ? "negative" : "neutral" : "neutral";
          return <li className={`session-news-item news-reference-item ${index === activeIndex ? "is-active" : ""} tone-${tone}`} data-event-id={identify(item)} key={identify(item)} onClick={() => { setActiveId(identify(item)); }} onFocusCapture={() => setActiveId(identify(item))}>
            {published && (index === 0 || groupLabel(visible[index-1]) !== groupLabel(item)) ? <div className="news-reference-group"><span>{groupLabel(item)}</span><i aria-hidden="true"/></div> : null}
            <div className="news-reference-body"><span className="news-reference-dot" aria-hidden="true"/><div className="news-reference-copy"><div className="news-reference-headline"><strong title={published && item.symbol ? `${item.symbol} · ${label}` : label}>{published && item.symbol ? `${item.symbol} · ` : ""}{label}</strong>{metric ? <b className={`news-reference-value tone-${tone}`}>{metric}</b> : null}</div>
              {published ? <div className="session-news-meta">{item.dateBasis !== "RECORDED_DATE" ? <span className="session-news-kind">{item.kind === "DISCLOSURE" ? "Disclosure" : (bn ? "প্রকাশিত খবর" : "Published news")}</span> : null}<time dateTime={item.publishedAt ?? item.publicationDate ?? item.time}>{marketNewsDateLabel(item,bn?"bn":"en")}{item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleTimeString(bn ? "bn-BD":"en-GB",{timeZone:"Asia/Dhaka",hour:"2-digit",minute:"2-digit"})}` : ""}</time></div> : null}
              {item.effectiveDate ? <small>{bn ? "কার্যকর" : "Effective"} · <time dateTime={item.effectiveDate}>{item.effectiveDate}</time></small> : null}
              {item.description && (published ? <NewsExcerpt text={item.description} bn={bn}/> : <p className="news-highlight-description">{item.description}</p>)}
            </div></div>
          </li>;
        })}
      </ul><footer className="news-reference-footer"><div className={`news-reference-progress${visible.length>8?" is-continuous":""}`} role="progressbar" aria-label={bn ? "নির্বাচিত খবর" : "Selected item"} aria-valuemin={1} aria-valuemax={visible.length} aria-valuenow={activeIndex+1} aria-valuetext={`${activeIndex+1} / ${visible.length}`}>{visible.length>8 ? <><i className="news-progress-track" aria-hidden="true"><b style={{width:`${(activeIndex+1)/visible.length*100}%`}}/></i><small aria-hidden="true">{activeIndex+1} / {visible.length}</small></> : visible.map((item,index)=><span key={identify(item)} aria-hidden="true" data-active={index === activeIndex ? "true" : undefined}/>)}</div><div>{activeHref ? <a key={activeHref} href={activeHref} target={activeExternal ? "_blank" : undefined} rel={activeExternal ? "noopener noreferrer" : undefined}>{activeExternal ? copy.sourceLink : (bn ? "শেয়ারের বিস্তারিত" : "Stock details")} ↗</a> : null}</div></footer>
    </> : <p className="sw-state" role="status">{generated ? copy.timelineEmpty : bn ? "এই সময়সীমার খবর এই feed-এ পাওয়া যায়নি।" : "No news available in this feed for the session window."}</p>}
  </div>;
}
