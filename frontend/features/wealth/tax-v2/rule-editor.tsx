import { createContext, useContext, useState, useEffect, useId, type ReactNode } from "react";
import { Input, Select, Check, ReadOnlyRules, printedPageCitation, useRuleFieldError, type AdminTab } from "./admin-fields";
import { AdminPanel, readableRule, HelpPopover } from "./admin-panel";
import { bdt } from "./fields";
import { sourceHref } from "./rule-sources";
import type { Approval, FilingWindow, RulePack, SourceDocument, SourceReference } from "./contracts";
import { Button, Input as FilterInput, Select as FilterSelect } from "./fields";
import css from "./tax.module.css";

const thresholdLabels: Record<keyof RulePack["thresholds"], string> = {
  general: "General taxpayer", woman_or_senior: "Woman or eligible senior",
  disability_or_third_gender: "Disability or third gender",
  gazetted_war_wounded_or_injured_july_warrior: "Gazetted war-wounded freedom fighter or injured July warrior",
  disabled_dependent_addition: "Addition per eligible disabled dependent",
};
const moneyFields = {
  employment_exemption_cap: "Employment exemption cap (BDT)",
  dps_cap: "Shared DPS cap (BDT)", government_securities_cap: "Shared government securities cap (BDT)",
  life_insurance_sum_assured_rate: "Life premium limit (% of actual sum assured)",
  dividend_rate: "Domestic dividend rate (%)", listed_gain_exemption: "Listed gain exemption (BDT)",
  listed_gain_rate: "Listed gain rate (%)", part2_donation_limit_rate: "Part 2 donation income limit (%)",
  ordinary_turnover_zero_rate_ceiling: "Ordinary turnover zero-rate ceiling (BDT)",
} as const;
const moneyHelp: Record<keyof typeof moneyFields,string> = {
  employment_exemption_cap: "BDT · limits the shared exemption across gross private-employment entries: the smaller of one-third of each entry’s gross income after excluded group-insurance benefits and the remaining exemption cap.",
  dps_cap: "BDT · all qualifying DPS contribution entries share this annual cap; each eligible entry consumes the remaining allowance.",
  government_securities_cap: "BDT · qualifying government-security and savings-certificate investments consume the same annual allowance.",
  life_insurance_sum_assured_rate: "% · actual sum assured, excluding bonuses; eligibility checks still apply.",
  dividend_rate: "% · supported domestic dividend income.",
  listed_gain_exemption: "BDT · shared exemption for eligible listed gains in this assessment year.",
  listed_gain_rate: "% · separate rate used by supported listed-gain policies.",
  part2_donation_limit_rate: "% · income base determined by the Part 2 deduction policy.",
  ordinary_turnover_zero_rate_ceiling: "BDT · gross business receipts, not taxable profit. This ceiling determines whether the supported ordinary-business zero-rate turnover treatment applies.",
};
const policyNames: [FilingWindow["policy"], string][] = [["neutral", "No adjustment"], ["incentive", "Filing incentive"], ["additional_tax", "Additional tax"]];
const at = <T,>(rows: T[], index: number, row: T) => rows.map((item, i) => i === index ? row : item);
const omit = <T,>(rows: T[], index: number) => rows.filter((_, i) => i !== index);
const keys = <T extends object,>(obj: T) => Object.keys(obj) as (keyof T)[];

const EditorTab = createContext<AdminTab>("Tax rules");
const groupTabs: Record<string, AdminTab> = { "Profiles and minimum tax":"Tax rules", "Ordinary taxable bands":"Tax rules", "Employment exemption":"Tax rules", "Rebate limits":"Investments & rebate", "Investment eligibility, deduction and caps":"Investments & rebate", "Supported income and credit policies":"Tax rules", "Filing calendar":"Filing calendar", "English and Bangla presentation":"Labels & visibility", "Official sources and rule references":"Sources & evidence" };
function Group({ title, children, path }: { title: string; children: ReactNode; open?: boolean; path?: string }) {
 const tab = useContext(EditorTab);
 return <section hidden={groupTabs[title] !== tab} className="tax-admin-group" id={"rule-section-"+title.toLowerCase().replaceAll(" ","-")} data-path={path}><h3>{title}</h3><div className={css.stack}>{children}</div></section>;
}

function ReferenceEditor({ value, onChange, rules, path, disabled }: {
  value: SourceReference; onChange: (value: SourceReference) => void; rules: RulePack; path: string; disabled: boolean;
}) {
  const document = rules.sources.find(({ id }) => id === value.document_id);
  return <div className={css.stack+" tax-admin-reference"} data-path={path}>
    {document && <a href={sourceHref(document,value)} target="_blank" rel="noreferrer">View source ↗ · {document.public_edition ?? document.edition}</a>}
    <div className={css.fields}><Select disabled={disabled} label="Source document" path={path + ".document_id"} value={value.document_id}
      options={[...(!rules.sources.some((s) => s.id === value.document_id) ? [[value.document_id, "Select a document"] as const] : []), ...rules.sources.map((doc) => [doc.id, doc.edition || doc.id] as const)]}
      onChange={(document_id) => onChange({ ...value, document_id, public_pdf_pages: null })} />
    <Input disabled={disabled} label="Provision / printed-page citation" help="Retain any printed-page citation here, separately from PDF page numbers." path={path + ".provision"} value={value.provision} onChange={(provision) => onChange({ ...value, provision })} />
    <div className="tax-admin-value"><span>Printed-page reference</span><strong>{printedPageCitation(value.provision)}</strong></div>
    <PageNumbers disabled={disabled} label="Evidence PDF pages (comma-separated)" path={path + ".pdf_pages"} value={value.pdf_pages} onChange={(pdf_pages) => onChange({ ...value, pdf_pages, public_pdf_pages: null })} />
    <PageNumbers key={JSON.stringify([value.document_id, value.pdf_pages, document?.public_url, document?.public_edition, document?.sha256])} disabled={disabled} label="Verified linked PDF pages (optional)" path={path + ".public_pdf_pages"} value={value.public_pdf_pages ?? []} onChange={(pages) => onChange({ ...value, public_pdf_pages: pages.length ? pages : null })} />
    </div>
  </div>;
}
function PageNumbers({ value, disabled, path, label, onChange }: { value: number[]; disabled: boolean; path: string; label: string; onChange: (v: number[]) => void }) {
  const readOnly = useContext(ReadOnlyRules);
  const error=useRuleFieldError(path);
  const errorId=useId();
  if (readOnly) return <div className="tax-admin-value" data-path={path}><span>{label}</span><strong>{value.length ? value.join(", ") : "Not mapped"}</strong></div>;
  return <label className={css.field + (error ? " tax-admin-field-error" : "")} data-path={path}><span>{label}</span>
    <input aria-invalid={!!error || undefined} aria-describedby={error ? errorId : undefined} disabled={disabled} defaultValue={value.join(", ")} inputMode="text" onChange={(event) => {
      const text = event.target.value;
      onChange(text.split(",").map((part) => part.trim()).filter(Boolean).map((part) => /^\d+$/.test(part) ? Number(part) : 0));
    }} />{error && <small id={errorId}>{error}</small>}
  </label>;
}

export function RuleEditor({ rules, onChange, disabled, section = "Tax rules", readOnly = disabled, focusPath = "", focusEpoch = 0 }: { rules: RulePack; onChange: (rules: RulePack) => void; disabled: boolean; section?: AdminTab; readOnly?: boolean; focusPath?: string; focusEpoch?: number }) {
  const [search,setSearch] = useState("");
  const [visibility,setVisibility] = useState("all");
  const [recipientSearch,setRecipientSearch]=useState("");
  const [recipient,setRecipient]=useState<number|null>(null);
  const [documentIndex,setDocumentIndex]=useState(0);
  useEffect(()=>{if(section!=="Investments & rebate")setRecipient(null)},[section]);
  const [sourceView,setSourceView] = useState("documents");
  useEffect(()=>{
    if (focusPath.includes("investment_presentation")) {setSearch("");setVisibility("all");}
    if (focusPath.includes("rule_references")) setSourceView("references");
    else if (focusPath.includes("sources")) {setSourceView("documents");setDocumentIndex(Number(focusPath.match(/sources\.(\d+)/)?.[1] ?? 0));}
    if(focusPath.includes("donation_approvals"))setRecipient(Number(focusPath.match(/donation_approvals\.(\d+)/)?.[1] ?? 0));
  },[focusPath,focusEpoch]);
  const patch = (changes: Partial<RulePack>) => onChange({ ...rules, ...changes });
  const ruleMoney = (key: keyof typeof moneyFields) => <Input key={key} disabled={disabled} money path={"rules." + key} label={moneyFields[key]} help={moneyHelp[key]} value={rules[key]} onChange={(value) => patch({ [key]: value })} />;
  const freshRef = () => ({ document_id: rules.sources[0]?.id ?? "", pdf_pages: [1], provision: "" });
  function updateSource(index: number, changes: Partial<SourceDocument>) {
    const current = rules.sources[index];
    const revised = { ...current, ...changes };
    const sources = at(rules.sources, index, revised);
    const changedEvidence = current.public_url !== revised.public_url || current.public_edition !== revised.public_edition || current.sha256 !== revised.sha256;
    if (!changedEvidence) { patch({ sources }); return; }
    const resetMapping = (ref: SourceReference) => ref.document_id === current.id && ref.public_pdf_pages
      ? { ...ref, public_pdf_pages: null } : ref;
    patch({
      sources,
      rule_references: rules.rule_references.map((rule) => ({ ...rule, references: rule.references.map(resetMapping) })),
      donation_approvals: rules.donation_approvals.map((approval) => ({ ...approval, reference: resetMapping(approval.reference) })),
    });
  }
  return <ReadOnlyRules.Provider value={readOnly}><EditorTab.Provider value={section}><div className={css.stack}>
    {section === "Tax rules" && <nav aria-label="Tax rule shortcuts" className="tax-admin-shortcuts">{[["Allowances","profiles-and-minimum-tax"],["Minimum tax","minimum-tax"],["Slabs","ordinary-taxable-bands"],["Employment","employment-exemption"],["Other income","supported-income-and-credit-policies"]].map(([name,id])=><a key={id} href={"#rule-section-"+id} onClick={event=>{event.preventDefault();const target=document.getElementById("rule-section-"+id);const sticky=document.querySelector(".tax-admin-sticky");if(!target || !sticky)return;const rect=sticky.getBoundingClientRect();const offset=parseFloat(getComputedStyle(sticky).top)+rect.height+20;window.scrollBy({top:target.getBoundingClientRect().top-offset,behavior:"instant"});target.setAttribute("tabindex","-1");target.focus({preventScroll:true});}}>{name}</a>)}</nav>}
    <Group title="Profiles and minimum tax" open><RuleEvidence rules={rules} match="profile|minimum"/>
      <div className={css.scroll} tabIndex={0} role="region" aria-label="Scrollable configuration table"><table className={css.table}><thead><tr><th>Taxpayer allowance</th><th>Amount · BDT</th></tr></thead><tbody>
        {keys(thresholdLabels).map((key) => <tr key={key}><th scope="row">{thresholdLabels[key]}</th><td><Input disabled={disabled} money label={thresholdLabels[key] + " (BDT)"} path={"rules.thresholds." + key}
          value={rules.thresholds[key]} onChange={(v) => patch({ thresholds: { ...rules.thresholds, [key]: v } })} /></td></tr>)}
      </tbody></table></div><h4 id="rule-section-minimum-tax">Minimum tax</h4><div className={css.fields}>
        <Input disabled={disabled} money label="Ordinary minimum tax (BDT)" path="rules.minimum_tax.ordinary" value={rules.minimum_tax.ordinary} onChange={(ordinary) => patch({ minimum_tax: { ...rules.minimum_tax, ordinary } })} />
        <Input disabled={disabled} money label="Eligible new taxpayer minimum (BDT)" path="rules.minimum_tax.eligible_new_taxpayer" value={rules.minimum_tax.eligible_new_taxpayer} onChange={(eligible_new_taxpayer) => patch({ minimum_tax: { ...rules.minimum_tax, eligible_new_taxpayer } })} />
      </div>
      <p className={css.muted}>Allowances depend on the taxpayer’s qualifying profile. Minimum tax applies only when the relevant income and eligibility conditions are met.</p>
    </Group>
    <Group title="Ordinary taxable bands" open path="rules.taxable_bands"><RuleEvidence rules={rules} match="slab|band|ordinary"/>
      <p className={css.muted}>Band width is the additional income covered by that band, after the taxpayer allowance. The last band covers all remaining income. Ranges below illustrate the general taxpayer allowance; other profiles start at their own allowance.</p>
      <HelpPopover label="Example: reading a band width"><p>The first band starts above the selected taxpayer allowance. For a general taxpayer, the first configured range is {bandRange(rules,0)}. Each following width is added to the previous endpoint; the saved width itself is unchanged.</p></HelpPopover>
      <div className={css.scroll} tabIndex={0} role="region" aria-label="Scrollable configuration table"><table className={css.table}><thead><tr><th>Band</th><th>Taxable width · BDT</th><th>General taxpayer range · BDT</th><th>Rate · %</th>{!disabled && <th>Action</th>}</tr></thead><tbody>{rules.taxable_bands.map((band, i) => <tr key={i}><th scope="row">{i+1}</th><td>
        <Input disabled={disabled || band.width === null} money label={"Band " + (i + 1) + " width (BDT)"} path={"rules.taxable_bands." + i + ".width"} value={band.width ?? ""} placeholder="Remaining income" onChange={(width) => patch({ taxable_bands: at(rules.taxable_bands, i, { ...band, width }) })} /></td><td>{bandRange(rules,i)}</td><td>
        <Input disabled={disabled} money label={"Band " + (i + 1) + " rate (%)"} path={"rules.taxable_bands." + i + ".rate"} value={band.rate} onChange={(rate) => patch({ taxable_bands: at(rules.taxable_bands, i, { ...band, rate }) })} /></td>
        {!disabled && <td>{band.width !== null && <Button onClick={() => patch({ taxable_bands: omit(rules.taxable_bands, i) })}>Remove band</Button>}</td>}
      </tr>)}</tbody></table></div>
      {!disabled && <div><Button disabled={rules.taxable_bands.length >= 20} onClick={() => patch({ taxable_bands: [...rules.taxable_bands.slice(0, -1), { width: "", rate: "" }, ...rules.taxable_bands.slice(-1)] })}>Insert taxable band</Button></div>}
    </Group>
    <Group title="Employment exemption"><RuleEvidence rules={rules} match="employment"/><div className={css.fields}>{ruleMoney("employment_exemption_cap")}</div></Group>
    <Group title="Rebate limits"><div className="tax-admin-formula"><strong>Existing calculation · lowest of three limits</strong><p>{rules.rebate.income_rate}% × ordinary taxable income after allowed income deductions; {rules.rebate.investment_rate}% × eligible investment after eligibility checks and shared caps; or {bdt(rules.rebate.statutory_cap,"en")}.</p><HelpPopover label="Rebate bases, exceptions and usable reduction"><p>Personal tax-free allowances are applied in the slab calculation, not subtracted again from the rebate income base. Separate-rate income is excluded from this base.</p><p>Compare all three limits, then use the smallest. This is rebate entitlement; the final tax reduction also depends on tax liability and the applicable minimum tax.</p></HelpPopover></div><RuleEvidence rules={rules} match="rebate"/>
      <div className={css.fields}>
        {([["income_rate", "Income-based rebate limit (%)"], ["investment_rate", "Investment-based rebate limit (%)"], ["statutory_cap", "Statutory cap (BDT)"]] as const).map(([key, label]) =>
          <Input key={key} disabled={disabled} money label={label} path={"rules.rebate." + key} value={rules.rebate[key]} onChange={(v) => patch({ rebate: { ...rules.rebate, [key]: v } })} />)}
      </div>
    </Group>
    <Group title="Investment eligibility, deduction and caps" path="rules.donation_approvals"><RuleEvidence rules={rules} match="investment|dps|insurance|deduction"/>
      <div className={css.fields}>{(["dps_cap", "government_securities_cap", "life_insurance_sum_assured_rate", "part2_donation_limit_rate"] as const).map(ruleMoney)}</div>
      <p className={css.muted}>These caps limit eligible amounts. Visibility settings do not establish legal eligibility; qualification and contribution-date checks still apply.</p>
      <h3>Approved recipients</h3>
      <FilterInput label="Search approved recipients" value={recipientSearch} onChange={setRecipientSearch}/>
      <div className={css.scroll}><table className={css.table}><thead><tr><th>Recipient</th><th>Category</th><th>Validity</th><th>Evidence & details</th></tr></thead><tbody>{rules.donation_approvals.map((a,i)=>(a.label_en+a.label_bn+a.category).toLowerCase().includes(recipientSearch.toLowerCase()) && <tr key={i}><th>{a.label_en}<small className="tax-admin-subtitle">{a.label_bn}</small></th><td>{a.category==="zakat"?"Zakat":"Approved donation"}</td><td>{a.effective_from} → {a.expires_on || "No recorded expiry"}</td><td><Button onClick={()=>setRecipient(i)}>Open recipient</Button></td></tr>)}</tbody></table></div>
      <p role="status" className={css.muted}>{!rules.donation_approvals.some(a=>(a.label_en+a.label_bn+a.category).toLowerCase().includes(recipientSearch.toLowerCase())) && "No recipients match your search. "}{rules.donation_approvals.filter(a=>(a.label_en+a.label_bn+a.category).toLowerCase().includes(recipientSearch.toLowerCase())).length} of {rules.donation_approvals.length} recipients</p>
      {rules.donation_approvals.map((approval, i) => {
        const path = "rules.donation_approvals." + i;
        const update = (p: Partial<Approval>) => patch({ donation_approvals: at(rules.donation_approvals, i, { ...approval, ...p }) });
        return <AdminPanel key={i} title={approval.label_en || "New recipient"} open={recipient===i} onClose={()=>setRecipient(null)}><div data-path={path}>
          <div className={css.stack}>
            <div className={css.fields}>
              <Input disabled={disabled} label="Approval identifier" path={path + ".id"} value={approval.id} onChange={(id) => update({ id })} />
              <Select disabled={disabled} label="Recipient category" path={path + ".category"} value={approval.category} options={[["approved_donation", "Approved donation"], ["zakat", "Zakat"]]} onChange={(category) => update({ category })} />
              <Input disabled={disabled} label="English recipient label" path={path + ".label_en"} value={approval.label_en} onChange={(label_en) => update({ label_en })} />
              <Input disabled={disabled} label="Bangla recipient label" path={path + ".label_bn"} value={approval.label_bn} onChange={(label_bn) => update({ label_bn })} />
              <Input disabled={disabled} type="date" label="Effective from" path={path + ".effective_from"} value={approval.effective_from} onChange={(effective_from) => update({ effective_from })} />
              <Input disabled={disabled} type="date" label="Expires on (optional)" path={path + ".expires_on"} value={approval.expires_on ?? ""} onChange={(value) => update({ expires_on: value || null })} />
            </div>
            <ReferenceEditor value={approval.reference} rules={rules} path={path + ".reference"} disabled={disabled} onChange={(reference) => update({ reference })} />
            {!disabled && <div><Button onClick={() => {setRecipient(null);patch({ donation_approvals: omit(rules.donation_approvals, i) })}}>Remove approval</Button></div>}
          </div>
        </div></AdminPanel>;
      })}
      {!disabled && <div><Button disabled={rules.donation_approvals.length >= 100} onClick={() => {setRecipientSearch("");setRecipient(rules.donation_approvals.length);patch({ donation_approvals: [...rules.donation_approvals, {
        id: "", category: "approved_donation", label_en: "", label_bn: "", effective_from: "", expires_on: null, reference: freshRef(),
      }] });}}>Add approval</Button></div>}
    </Group>
    <Group title="Supported income and credit policies"><RuleEvidence rules={rules} match="dividend|gain|credit|turnover"/>
      <div className={css.fields}>{(["dividend_rate", "listed_gain_exemption", "listed_gain_rate", "ordinary_turnover_zero_rate_ceiling"] as const).map(ruleMoney)}</div>
      <p className={css.muted}>Supported ordinary and separate-rate sources, withholding and advance credits follow the engine’s eligibility checks. Special regimes and filing exceptions that need review do not have editable calculation parameters here.</p>
    </Group>
    <Group title="Filing calendar" path="rules.filing_windows"><RuleEvidence rules={rules} match="filing"/>{rules.filing_windows.length === 0 ? <div className="tax-admin-formula"><h4>Filing balance unavailable for AY {rules.assessment_year}</h4><p>This revision supports annual tax estimates without filing-date adjustments. A verified filing rule and compatible calculation support are needed before a filing calendar can be published.</p></div> : <>
      {!rules.filing_windows.length && <p className={css.muted}>This revision does not support a filing balance.</p>}
      <p className={css.muted}>Windows are inclusive. Listed chronologically; rates apply only within each window.</p>
      <div className={css.scroll} tabIndex={0} role="region" aria-label="Scrollable configuration table"><table className={css.table}><thead><tr><th>From</th><th>Through</th><th>Adjustment</th><th>Rate · %</th><th>Maximum incentive / minimum addition · BDT</th>{!disabled && <th>Action</th>}</tr></thead><tbody>{rules.filing_windows.map((window,i)=>({window,i})).sort((a,b)=>readOnly ? a.window.start.localeCompare(b.window.start) : a.i-b.i).map(({window, i}) => {
        const path = "rules.filing_windows." + i;
        const update = (p: Partial<FilingWindow>) => patch({ filing_windows: at(rules.filing_windows, i, { ...window, ...p }) });
        return <tr key={i}><td>
          <Input disabled={disabled} type="date" label="Start date" path={path + ".start"} value={window.start} onChange={(start) => update({ start })} /></td><td>
          <Input disabled={disabled} type="date" label="End date" path={path + ".end"} value={window.end} onChange={(end) => update({ end })} /></td><td>
          <Select disabled={disabled} label="Adjustment type" path={path + ".policy"} value={window.policy} options={policyNames} onChange={(policy) => update(policy === "neutral" ? { policy, rate: "0", limit: "0" } : { policy })} /></td><td>
          {window.policy !== "neutral" && <Input disabled={disabled} money label="Adjustment rate (%)" path={path + ".rate"} value={window.rate} onChange={(rate) => update({ rate })} />}{window.policy === "neutral" && <span>Not applicable</span>}</td><td>
          {window.policy !== "neutral" && <span className="tax-admin-subtitle">{window.policy === "additional_tax" ? "Minimum addition" : "Maximum incentive"}</span>}{window.policy !== "neutral" && <Input disabled={disabled} money label={window.policy === "additional_tax" ? "Minimum addition (BDT)" : "Maximum incentive (BDT)"} path={path + ".limit"} value={window.limit} onChange={(limit) => update({ limit })} />}{window.policy === "neutral" && <span>Not applicable</span>}</td>
          {!disabled && <td><Button onClick={() => patch({ filing_windows: omit(rules.filing_windows, i) })}>Remove window</Button></td>}
        </tr>;
      })}</tbody></table></div>
      </>}{!disabled && rules.assessment_year !== "2027-28" && <div><Button disabled={rules.assessment_year === "2027-28" || rules.filing_windows.length >= 12} onClick={() => patch({ filing_windows: [...rules.filing_windows, { start: "", end: "", policy: "neutral", rate: "0", limit: "0" }] })}>Add filing window</Button></div>}

    </Group>
    <Group title="English and Bangla presentation" path="rules.investment_presentation">
      <p className={css.muted}>Visibility affects new entry options only. It does not affect legal eligibility or existing entries.</p>
      <div className={css.row}><FilterInput label="Search categories" value={search} onChange={setSearch} /><FilterSelect label="Category visibility" value={visibility} options={[["all","All categories"],["visible","Visible only"],["hidden","Hidden only"]]} onChange={setVisibility} /></div>
      <div className={css.row}><p>{rules.investment_presentation.filter(item=>(item.category+item.label_en+item.label_bn).toLowerCase().includes(search.toLowerCase()) && (visibility==="all" || item.visible===(visibility==="visible"))).length} of {rules.investment_presentation.length} categories</p><Button onClick={()=>{setSearch("");setVisibility("all")}}>Clear filters</Button></div>
      <div className={css.scroll} tabIndex={0} role="region" aria-label="Scrollable configuration table"><table className={css.table+" tax-admin-label-table"}><thead><tr><th>Category</th><th>English label</th><th>Bangla label</th><th>Order</th><th>New entries</th></tr></thead><tbody>
      {rules.investment_presentation.map((item, i) => {
        if (!(item.category+item.label_en+item.label_bn).toLowerCase().includes(search.toLowerCase()) || (visibility !== "all" && item.visible !== (visibility === "visible"))) return null;
        const path = "rules.investment_presentation." + i;
        const update = (change: Partial<typeof item>) => patch({ investment_presentation: at(rules.investment_presentation, i, { ...item, ...change }) });
        return <tr key={item.category}><th scope="row">{item.label_en}<small className="tax-admin-key">{item.category}</small></th>
          <td><Input disabled={disabled} label={item.category + " English label"} path={path + ".label_en"} value={item.label_en} onChange={(label_en) => update({ label_en })} /></td>
          <td><Input disabled={disabled} label={item.category + " Bangla label"} path={path + ".label_bn"} value={item.label_bn} onChange={(label_bn) => update({ label_bn })} /></td>
          <td><Input disabled={disabled} type="number" label={item.category + " Display order"} path={path + ".order"} value={String(item.order)} min="0" max="1000" onChange={(v) => { if (/^\d{0,4}$/.test(v) && Number(v) <= 1000) update({ order: Number(v) }); }} /></td>
          <td><Check disabled={disabled} label={item.category + " Visible for new entries"} path={path + ".visible"} checked={item.visible} onChange={(visible) => update({ visible })} /></td>
        </tr>;
      })}</tbody></table></div>
      {!rules.investment_presentation.some(item => (item.category+item.label_en+item.label_bn).toLowerCase().includes(search.toLowerCase()) && (visibility === "all" || item.visible === (visibility === "visible"))) && <p>No categories match these filters.</p>}

    </Group>
    <Group title="Official sources and rule references" path="rules">
      <p className={css.muted}>Use official Bangladesh government HTTPS sources. Record the evidence edition and SHA-256. Add linked PDF pages only after checking the exact public edition; leave them blank when the page match is unknown.</p>
      <div className={css.row}><Button selected={sourceView === "documents"} onClick={()=>setSourceView("documents")}>Document editions</Button><Button selected={sourceView === "references"} onClick={()=>setSourceView("references")}>Rule references</Button></div>
      <div hidden={sourceView !== "documents"} className="tax-admin-source-browser">
      <div className="tax-admin-document-list" aria-label="Document editions">{rules.sources.map((source,i)=><button type="button" key={i} aria-pressed={documentIndex===i} onClick={()=>setDocumentIndex(i)}>{source.edition}<small>{rules.rule_references.reduce((n,r)=>n+r.references.filter(ref=>ref.document_id===source.id).length,0)} rule citations · document record {i+1}</small></button>)}</div>
      {rules.sources.map((source, i) => {
        const path = "rules.sources." + i;
        const update = (p: Partial<typeof source>) => updateSource(i, p);
        return <div key={i} hidden={documentIndex!==i} className={css.card + " " + css.stack}>
          <h4>{source.edition || "New document edition"}</h4><a href={sourceHref(source)} target="_blank" rel="noreferrer">View source ↗</a><div className={css.fields}>
          <Input disabled={disabled} label="Document identifier" path={path + ".id"} value={source.id} onChange={(id) => update({ id })} />
          <Input disabled={disabled} label="Edition or title" path={path + ".edition"} value={source.edition} onChange={(edition) => update({ edition })} />
          <Input disabled={disabled} label="Official source URL" path={path + ".public_url"} value={source.public_url} onChange={(public_url) => update({ public_url })} />
          <Input disabled={disabled} label="Public edition (if different)" path={path + ".public_edition"} value={source.public_edition ?? ""} onChange={(edition) => update({ public_edition: edition || null })} />
          <Input disabled={disabled} label="SHA-256" path={path + ".sha256"} value={source.sha256} onChange={(sha256) => update({ sha256 })} />
          </div>{!disabled && <div><Button disabled={rules.sources.length <= 1} onClick={() => {setDocumentIndex(Math.max(0,i-1));patch({ sources: omit(rules.sources, i) })}}>Remove source</Button></div>}
        </div>;
      })}
      {!disabled && <div><Button disabled={rules.sources.length >= 30} onClick={() => {setDocumentIndex(rules.sources.length);patch({ sources: [...rules.sources, { id: "", edition: "", public_url: "", sha256: "" }] });}}>Add source</Button></div>}
      </div><div hidden={sourceView !== "references"}>
      <p className={css.muted}>Evidence PDF pages, printed-page citations in the provision, and verified linked PDF pages are distinct. Printed page numbers are preserved in their existing citations; no conversion is inferred.</p>
      {rules.rule_references.map((rule, i) => <details key={rule.id} className={css.card} data-path={"rules.rule_references." + i}><summary>{readableRule(rule.id)} · {rule.references.length} {rule.references.length===1?"citation":"citations"}</summary>
        <div className={css.stack}>
          <details><summary>Rule identity & supported facts</summary><code>{rule.id}</code><p>{rule.supported_facts.join(" · ")}</p></details>
          {rule.references.map((ref, j) => <div key={j} className={css.stack}>
            <ReferenceEditor value={ref} rules={rules} path={"rules.rule_references." + i + ".references." + j} disabled={disabled}
              onChange={(r) => patch({ rule_references: at(rules.rule_references, i, { ...rule, references: at(rule.references, j, r) }) })} />
            {!disabled && <div><Button disabled={rule.references.length <= 1} onClick={() => patch({ rule_references: at(rules.rule_references, i, { ...rule, references: omit(rule.references, j) }) })}>Remove reference</Button></div>}
          </div>)}
          {!disabled && <div><Button disabled={rule.references.length >= 10} onClick={() => patch({ rule_references: at(rules.rule_references, i, { ...rule, references: [...rule.references, freshRef()] }) })}>Add legal reference</Button></div>}
        </div>
      </details>)}
      </div>
    </Group>
  </div></EditorTab.Provider></ReadOnlyRules.Provider>;
}


function RuleEvidence({rules,match}:{rules:RulePack;match:string}) {
 const [open,setOpen]=useState(false);
 const refs=rules.rule_references.filter(rule=>new RegExp(match).test(rule.id));
 const citations=refs.reduce((count,rule)=>count+rule.references.length,0);
 if(!refs.length) return null;
 return <><button type="button" className="tax-admin-evidence-trigger" onClick={()=>setOpen(true)}>View evidence · {refs.length} {refs.length===1?"rule":"rules"} · {citations} {citations===1?"citation":"citations"}</button><AdminPanel title="Rule evidence" open={open} onClose={()=>setOpen(false)}><p>AY {rules.assessment_year} · selected revision evidence. Supplied and linked editions may differ.</p>{refs.map(rule=><article className="tax-admin-evidence-record" key={rule.id}><h3>{readableRule(rule.id)}</h3><details><summary>Internal rule identity</summary><code>{rule.id}</code><p>{rule.effective_basis}</p></details>{rule.references.map((ref,i)=>{const doc=rules.sources.find(doc=>doc.id===ref.document_id);return <div key={i}><h4>{doc?.edition || "Document unavailable"}</h4><p>{ref.provision || "Provision not recorded"}</p><dl><dt>Supplied-document PDF pages</dt><dd>{ref.pdf_pages.join(", ") || "Not recorded"}</dd><dt>Printed pages</dt><dd>{printedPageCitation(ref.provision)}</dd><dt>Verified linked-document pages</dt><dd>{ref.public_pdf_pages?.join(", ") || "Not mapped"}</dd></dl>{doc && <><a href={sourceHref(doc,ref)} target="_blank" rel="noreferrer">Open linked document ↗</a><details><summary>Edition, URL & fingerprint</summary><p>Linked edition: {doc.public_edition || doc.edition}</p><p>{doc.public_url}</p><code>{doc.sha256}</code></details></>}</div>})}</article>)}</AdminPanel></>;
}
function bandRange(rules:RulePack,index:number) {
 const unfinished="Enter a band width to calculate the range";
 const amount=(value:string)=>{
  if(!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("Incomplete amount");
  const [whole,fraction=""]=value.split(".");return BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,"0"));
 };
 const decimal=(value:bigint)=>(value/BigInt(100)).toString()+"."+(value%BigInt(100)).toString().padStart(2,"0");
 try {
  let start=amount(rules.thresholds.general);
  for(const band of rules.taxable_bands.slice(0,index)) {
   if(band.width===null || amount(band.width)<=BigInt(0))return unfinished;
   start+=amount(band.width);
  }
  const width=rules.taxable_bands[index].width;
  if(width!==null && amount(width)<=BigInt(0))return unfinished;
  return "Above "+bdt(decimal(start),"en")+(width===null ? " · remaining" : " to "+bdt(decimal(start+amount(width)),"en"));
 }catch{return unfinished}
}
