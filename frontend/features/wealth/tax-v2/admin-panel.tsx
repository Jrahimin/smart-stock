import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./fields";

/** A nonmodal desktop panel keeps the rule visible; narrow screens use a modal. */
export function AdminPanel({open,title,onClose,children}:{open:boolean;title:string;onClose:()=>void;children:ReactNode}) {
 const ref=useRef<HTMLDialogElement>(null), opener=useRef<HTMLElement|null>(null), id=useId();
 useEffect(()=>{
  const node=ref.current;if(!node)return;
  if(open){opener.current=document.activeElement as HTMLElement;
   if(!node.open){if(window.matchMedia?.("(max-width: 760px)").matches) node.showModal?.();else node.show?.();if(!node.open)node.setAttribute("open","");}
   const invalid=node.querySelector<HTMLElement>('[aria-invalid="true"]');
   (invalid ?? node.querySelector<HTMLElement>("button"))?.focus();
   invalid?.scrollIntoView?.({block:"center",behavior:"instant"});
  }else if(node.open){node.close?.();node.removeAttribute("open");opener.current?.focus();}
 },[open]);
 useEffect(()=>{if(!open)return;const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();onClose()}};document.addEventListener("keydown",escape);return()=>document.removeEventListener("keydown",escape)},[open,onClose]);
 useEffect(()=>{
  if(!open)return;
  const align=()=>{const header=document.querySelector('.tax-admin-selection')?.getBoundingClientRect();const tabs=document.querySelector('.tax-admin-tabs')?.getBoundingClientRect();ref.current?.style.setProperty('--tax-panel-top',Math.max(0,header?.bottom ?? 0,tabs?.bottom ?? 0)+"px")};
  align();window.addEventListener("scroll",align,true);window.addEventListener("resize",align);
  return()=>{window.removeEventListener("scroll",align,true);window.removeEventListener("resize",align)};
 },[open]);
 return <dialog ref={ref} className="tax-admin-side-panel" aria-labelledby={id} onCancel={e=>{e.preventDefault();onClose()}}><header><div><span className="tax-admin-eyebrow">Configuration reference</span><h2 id={id}>{title}</h2></div><Button onClick={onClose}>Close panel</Button></header><div className="tax-admin-panel-body">{children}</div></dialog>;
}

const names:Record<string,string>={"income.employment":"Employment income","income.ordinary":"Ordinary income","income.dividend":"Domestic dividends","income.listed_gain":"Listed gains","profile.allowance":"Tax-free allowances","tax.slabs":"Progressive income slabs","tax.minimum":"Minimum tax","rebate.general":"Investment rebate","investment.gov_securities":"Government securities","investment.dps":"DPS contributions","deduction.czm":"CZM donation deduction","credit.advance":"Advance tax credits","filing.windows":"Filing adjustments"};
export const readableRule=(id:string)=>names[id] || id.split(/[._]/).map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(" ");
export function HelpPopover({label,children}:{label:string;children:ReactNode}) {
 const id=useId();
 return <><button type="button" popoverTarget={id} className="tax-admin-evidence-trigger">{label}</button><div id={id} popover="auto" className="tax-admin-help-popover"><h3>{label}</h3>{children}<button type="button" popoverTarget={id} popoverTargetAction="hide">Close explanation</button></div></>;
}
