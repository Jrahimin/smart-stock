import type { ReactNode } from "react";
import type { Approval, FilingWindow, RulePack, SourceDocument, SourceReference } from "./contracts";
import { Button, Check, Input, Select } from "./fields";
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
const policyNames: [FilingWindow["policy"], string][] = [["neutral", "No adjustment"], ["incentive", "Filing incentive"], ["additional_tax", "Additional tax"]];
const at = <T,>(rows: T[], index: number, row: T) => rows.map((item, i) => i === index ? row : item);
const omit = <T,>(rows: T[], index: number) => rows.filter((_, i) => i !== index);
const keys = <T extends object,>(obj: T) => Object.keys(obj) as (keyof T)[];

function Group({ title, children, open, path }: { title: string; children: ReactNode; open?: boolean; path?: string }) {
  return <details className={css.detail} open={open} data-path={path}><summary>{title}</summary><div className={css.stack}>{children}</div></details>;
}

function ReferenceEditor({ value, onChange, rules, path, disabled }: {
  value: SourceReference; onChange: (value: SourceReference) => void; rules: RulePack; path: string; disabled: boolean;
}) {
  const document = rules.sources.find(({ id }) => id === value.document_id);
  return <div className={css.fields} data-path={path}>
    <Select disabled={disabled} label="Source document" path={path + ".document_id"} value={value.document_id}
      options={[...(!rules.sources.some((s) => s.id === value.document_id) ? [[value.document_id, "Select a document"] as const] : []), ...rules.sources.map((doc) => [doc.id, doc.edition || doc.id] as const)]}
      onChange={(document_id) => onChange({ ...value, document_id, public_pdf_pages: null })} />
    <Input disabled={disabled} label="Provision or section" path={path + ".provision"} value={value.provision} onChange={(provision) => onChange({ ...value, provision })} />
    <PageNumbers disabled={disabled} label="Evidence PDF pages (comma-separated)" path={path + ".pdf_pages"} value={value.pdf_pages} onChange={(pdf_pages) => onChange({ ...value, pdf_pages, public_pdf_pages: null })} />
    <PageNumbers key={JSON.stringify([value.document_id, value.pdf_pages, document?.public_url, document?.public_edition, document?.sha256])} disabled={disabled} label="Verified linked PDF pages (optional)" path={path + ".public_pdf_pages"} value={value.public_pdf_pages ?? []} onChange={(pages) => onChange({ ...value, public_pdf_pages: pages.length ? pages : null })} />
  </div>;
}
function PageNumbers({ value, disabled, path, label, onChange }: { value: number[]; disabled: boolean; path: string; label: string; onChange: (v: number[]) => void }) {
  return <label className={css.field} data-path={path}><span>{label}</span>
    <input disabled={disabled} defaultValue={value.join(", ")} inputMode="text" onChange={(event) => {
      const text = event.target.value;
      onChange(text.split(",").map((part) => part.trim()).filter(Boolean).map((part) => /^\d+$/.test(part) ? Number(part) : 0));
    }} />
  </label>;
}

export function RuleEditor({ rules, onChange, disabled }: { rules: RulePack; onChange: (rules: RulePack) => void; disabled: boolean }) {
  const patch = (changes: Partial<RulePack>) => onChange({ ...rules, ...changes });
  const ruleMoney = (key: keyof typeof moneyFields) => <Input key={key} disabled={disabled} money path={"rules." + key} label={moneyFields[key]} value={rules[key]} onChange={(value) => patch({ [key]: value })} />;
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
  return <div className={css.stack}>
    <Group title="Profiles and minimum tax" open>
      <div className={css.fields}>
        {keys(thresholdLabels).map((key) => <Input key={key} disabled={disabled} money label={thresholdLabels[key] + " (BDT)"} path={"rules.thresholds." + key}
          value={rules.thresholds[key]} onChange={(v) => patch({ thresholds: { ...rules.thresholds, [key]: v } })} />)}
        <Input disabled={disabled} money label="Ordinary minimum tax (BDT)" path="rules.minimum_tax.ordinary" value={rules.minimum_tax.ordinary} onChange={(ordinary) => patch({ minimum_tax: { ...rules.minimum_tax, ordinary } })} />
        <Input disabled={disabled} money label="Eligible new taxpayer minimum (BDT)" path="rules.minimum_tax.eligible_new_taxpayer" value={rules.minimum_tax.eligible_new_taxpayer} onChange={(eligible_new_taxpayer) => patch({ minimum_tax: { ...rules.minimum_tax, eligible_new_taxpayer } })} />
      </div>
      <p className={css.muted}>The backend determines the qualifying profile and when the minimum binds.</p>
    </Group>
    <Group title="Ordinary taxable bands" open path="rules.taxable_bands">
      <p className={css.muted}>Enter widths above the applicable personal threshold. The last band covers the remaining income.</p>
      {rules.taxable_bands.map((band, i) => <div key={i} className={css.card + " " + css.fields}>
        <Input disabled={disabled || band.width === null} money label={"Band " + (i + 1) + " width (BDT)"} path={"rules.taxable_bands." + i + ".width"} value={band.width ?? ""} placeholder="Remaining income" onChange={(width) => patch({ taxable_bands: at(rules.taxable_bands, i, { ...band, width }) })} />
        <Input disabled={disabled} money label={"Band " + (i + 1) + " rate (%)"} path={"rules.taxable_bands." + i + ".rate"} value={band.rate} onChange={(rate) => patch({ taxable_bands: at(rules.taxable_bands, i, { ...band, rate }) })} />
        {!disabled && band.width !== null && <div><Button onClick={() => patch({ taxable_bands: omit(rules.taxable_bands, i) })}>Remove band</Button></div>}
      </div>)}
      {!disabled && <div><Button disabled={rules.taxable_bands.length >= 20} onClick={() => patch({ taxable_bands: [...rules.taxable_bands.slice(0, -1), { width: "", rate: "" }, ...rules.taxable_bands.slice(-1)] })}>Insert taxable band</Button></div>}
    </Group>
    <Group title="Employment and rebate">
      <div className={css.fields}>
        {ruleMoney("employment_exemption_cap")}
        {([["income_rate", "Income-based rebate limit (%)"], ["investment_rate", "Investment-based rebate limit (%)"], ["statutory_cap", "Statutory cap (BDT)"]] as const).map(([key, label]) =>
          <Input key={key} disabled={disabled} money label={label} path={"rules.rebate." + key} value={rules.rebate[key]} onChange={(v) => patch({ rebate: { ...rules.rebate, [key]: v } })} />)}
      </div>
    </Group>
    <Group title="Investment eligibility, deduction and caps" path="rules.donation_approvals">
      <div className={css.fields}>{(["dps_cap", "government_securities_cap", "life_insurance_sum_assured_rate", "part2_donation_limit_rate"] as const).map(ruleMoney)}</div>
      <p className={css.muted}>These limits affect calculations. Source eligibility is enforced by the backend policies.</p>
      <h3>Approved recipients</h3>
      {rules.donation_approvals.map((approval, i) => {
        const path = "rules.donation_approvals." + i;
        const update = (p: Partial<Approval>) => patch({ donation_approvals: at(rules.donation_approvals, i, { ...approval, ...p }) });
        return <details className={css.card} key={i} data-path={path}><summary>{approval.label_en || "New recipient"} · {approval.label_bn}</summary>
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
            {!disabled && <div><Button onClick={() => patch({ donation_approvals: omit(rules.donation_approvals, i) })}>Remove approval</Button></div>}
          </div>
        </details>;
      })}
      {!disabled && <div><Button disabled={rules.donation_approvals.length >= 100} onClick={() => patch({ donation_approvals: [...rules.donation_approvals, {
        id: "", category: "approved_donation", label_en: "", label_bn: "", effective_from: "", expires_on: null, reference: freshRef(),
      }] })}>Add approval</Button></div>}
    </Group>
    <Group title="Supported income and credit policies">
      <div className={css.fields}>{(["dividend_rate", "listed_gain_exemption", "listed_gain_rate", "ordinary_turnover_zero_rate_ceiling"] as const).map(ruleMoney)}</div>
      <p className={css.muted}>Supported ordinary and separate-rate sources, withholding and advance credits follow the engine’s eligibility checks. Special regimes and filing exceptions that need review do not have editable calculation parameters here.</p>
    </Group>
    <Group title="Filing calendar" path="rules.filing_windows">
      {!rules.filing_windows.length && <p className={css.muted}>This revision does not support a filing balance.</p>}
      {rules.filing_windows.map((window, i) => {
        const path = "rules.filing_windows." + i;
        const update = (p: Partial<FilingWindow>) => patch({ filing_windows: at(rules.filing_windows, i, { ...window, ...p }) });
        return <div key={i} className={css.card + " " + css.fields}>
          <Input disabled={disabled} type="date" label="Start date" path={path + ".start"} value={window.start} onChange={(start) => update({ start })} />
          <Input disabled={disabled} type="date" label="End date" path={path + ".end"} value={window.end} onChange={(end) => update({ end })} />
          <Select disabled={disabled} label="Adjustment type" path={path + ".policy"} value={window.policy} options={policyNames} onChange={(policy) => update(policy === "neutral" ? { policy, rate: "0", limit: "0" } : { policy })} />
          <Input disabled={disabled || window.policy === "neutral"} money label="Adjustment rate (%)" path={path + ".rate"} value={window.rate} onChange={(rate) => update({ rate })} />
          <Input disabled={disabled || window.policy === "neutral"} money label={window.policy === "additional_tax" ? "Minimum addition (BDT)" : "Maximum incentive (BDT)"} path={path + ".limit"} value={window.limit} onChange={(limit) => update({ limit })} />
          {!disabled && <div><Button onClick={() => patch({ filing_windows: omit(rules.filing_windows, i) })}>Remove window</Button></div>}
        </div>;
      })}
      {!disabled && <div><Button disabled={rules.assessment_year === "2027-28" || rules.filing_windows.length >= 12} onClick={() => patch({ filing_windows: [...rules.filing_windows, { start: "", end: "", policy: "neutral", rate: "0", limit: "0" }] })}>Add filing window</Button></div>}
      {rules.assessment_year === "2027-28" && <p className={css.muted}>Filing adjustments are unavailable for this year until supported by a verified rule and engine release.</p>}
    </Group>
    <Group title="English and Bangla presentation" path="rules.investment_presentation">
      <p className={css.muted}>Visibility affects new entry options only. It does not affect legal eligibility or existing entries.</p>
      {rules.investment_presentation.map((item, i) => {
        const path = "rules.investment_presentation." + i;
        const update = (change: Partial<typeof item>) => patch({ investment_presentation: at(rules.investment_presentation, i, { ...item, ...change }) });
        return <details key={item.category} className={css.card}><summary>{item.label_en} · {item.label_bn}{item.visible ? "" : " (hidden)"}</summary>
          <div className={css.fields}>
            <Input disabled={disabled} label="English label" path={path + ".label_en"} value={item.label_en} onChange={(label_en) => update({ label_en })} />
            <Input disabled={disabled} label="Bangla label" path={path + ".label_bn"} value={item.label_bn} onChange={(label_bn) => update({ label_bn })} />
            <Input disabled={disabled} type="number" label="Display order" path={path + ".order"} value={String(item.order)} min="0" max="1000" onChange={(v) => { if (/^\d{0,4}$/.test(v) && Number(v) <= 1000) update({ order: Number(v) }); }} />
            <Check disabled={disabled} label="Visible for new entries" path={path + ".visible"} checked={item.visible} onChange={(visible) => update({ visible })} />
          </div>
        </details>;
      })}
    </Group>
    <Group title="Official sources and rule references" path="rules">
      <Input disabled={disabled} type="date" label="Rules reviewed on" path="rules.reviewed_on" value={rules.reviewed_on} onChange={(reviewed_on) => patch({ reviewed_on })} />
      <p className={css.muted}>Use official Bangladesh government HTTPS sources. Record the evidence edition and SHA-256. Add linked PDF pages only after checking the exact public edition; leave them blank when the page match is unknown.</p>
      {rules.sources.map((source, i) => {
        const path = "rules.sources." + i;
        const update = (p: Partial<typeof source>) => updateSource(i, p);
        return <div key={i} className={css.card + " " + css.fields}>
          <Input disabled={disabled} label="Document identifier" path={path + ".id"} value={source.id} onChange={(id) => update({ id })} />
          <Input disabled={disabled} label="Edition or title" path={path + ".edition"} value={source.edition} onChange={(edition) => update({ edition })} />
          <Input disabled={disabled} label="Official source URL" path={path + ".public_url"} value={source.public_url} onChange={(public_url) => update({ public_url })} />
          <Input disabled={disabled} label="Public edition (if different)" path={path + ".public_edition"} value={source.public_edition ?? ""} onChange={(edition) => update({ public_edition: edition || null })} />
          <Input disabled={disabled} label="SHA-256" path={path + ".sha256"} value={source.sha256} onChange={(sha256) => update({ sha256 })} />
          {!disabled && <div><Button disabled={rules.sources.length <= 1} onClick={() => patch({ sources: omit(rules.sources, i) })}>Remove source</Button></div>}
        </div>;
      })}
      {!disabled && <div><Button disabled={rules.sources.length >= 30} onClick={() => patch({ sources: [...rules.sources, { id: "", edition: "", public_url: "", sha256: "" }] })}>Add source</Button></div>}
      {rules.rule_references.map((rule, i) => <details key={rule.id} className={css.card} data-path={"rules.rule_references." + i}><summary>{rule.id.replaceAll(".", " · ").replaceAll("_", " ")}</summary>
        <div className={css.stack}>
          <p className={css.muted}>{rule.supported_facts.join(" · ")}</p>
          {rule.references.map((ref, j) => <div key={j} className={css.stack}>
            <ReferenceEditor value={ref} rules={rules} path={"rules.rule_references." + i + ".references." + j} disabled={disabled}
              onChange={(r) => patch({ rule_references: at(rules.rule_references, i, { ...rule, references: at(rule.references, j, r) }) })} />
            {!disabled && <div><Button disabled={rule.references.length <= 1} onClick={() => patch({ rule_references: at(rules.rule_references, i, { ...rule, references: omit(rule.references, j) }) })}>Remove reference</Button></div>}
          </div>)}
          {!disabled && <div><Button disabled={rule.references.length >= 10} onClick={() => patch({ rule_references: at(rules.rule_references, i, { ...rule, references: [...rule.references, freshRef()] }) })}>Add legal reference</Button></div>}
        </div>
      </details>)}
    </Group>
  </div>;
}

