"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { useAuth } from "@/features/auth/context/auth-context";
import { BackendApiError } from "@/lib/api/backend-api-client";
import { createTaxDraft, discardTaxDraft, getTaxConfig, getTaxRevision, issueFromError, listTaxRevisions, previewTaxDraft, publishTaxDraft, saveTaxDraft } from "./api";
import type { Preview, Revision, RevisionSummary, RulePack, Year } from "./contracts";
import { Input, bdt, Button, Check, dateLabel, Rows, Select } from "./fields";
import { RuleEditor } from "./rule-editor";
import { focusField } from "./focus-field";
import { sourceHref } from "./rule-sources";
import css from "./tax.module.css";

const statusLabels: Record<RevisionSummary["status"], string> = { draft: "Draft", published: "Published", superseded: "Superseded", discarded: "Discarded draft", archived_legacy: "Archived legacy" };
const summaryLabel = (row: RevisionSummary) => "Revision " + row.revision_number + " · " + statusLabels[row.status];
const ruleLabel = (value: string) => value.replaceAll(".", " · ").replaceAll("_", " ");
const years: [Year | "legacy", string][] = [["2026-27", "AY 2026–27"], ["2027-28", "AY 2027–28"], ["legacy", "Legacy archive"]];
const errorText = (error: unknown) => error instanceof BackendApiError ? error.message : "The request could not be completed. Try again.";
const isConflict = (error: unknown) => error instanceof BackendApiError && error.status === 409;
const display = (value: unknown) => value == null ? "—" : typeof value === "string" ? value : JSON.stringify(value, null, 2);

export function TaxPlannerV2Admin() {
  const { user } = useAuth();
  if (!user) return null;
  return <AdminSession key={user.id} account={user.id} canWrite={user.role === "SUPER_ADMIN"} />;
}
function AdminSession({ account, canWrite }: { account: string; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const listKey = ["tax-planner-v2", "admin", account, "revisions"];
  const detailKey = (id: string) => ["tax-planner-v2", "admin", account, "revision", id];
  const [newYear, setNewYear] = useState("");
  const [year, setYear] = useState<Year | "legacy">("2026-27");
  const [choice, setChoice] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<unknown>();
  const [pendingDiscard, setPendingDiscard] = useState<{ draft: RevisionSummary; source?: Revision }>();
  const [discardReason, setDiscardReason] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [readEpoch, setReadEpoch] = useState(0);
  const lock = useRef(false);
  const list = useQuery({ queryKey: listKey, queryFn: ({ signal }) => listTaxRevisions(signal), retry: false, gcTime: 0 });
  const publicActive = [...(list.data ?? [])].filter((row) => row.status === "published").sort((a,b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))[0];
  const initializedYear = useRef(false);
  useEffect(() => {
    if (!initializedYear.current && publicActive?.assessment_year) {
      initializedYear.current = true;
      setYear(publicActive.assessment_year);
    }
  }, [publicActive?.assessment_year]);
  const rows = (list.data ?? []).filter((row) => year === "legacy" ? row.status === "archived_legacy" : row.assessment_year === year);
  const active = rows.find((row) => row.status === "published");
  const draft = rows.find((row) => row.status === "draft");
  const id = choice ?? active?.id ?? draft?.id ?? rows[0]?.id;
  const details = useQuery({ queryKey: detailKey(id ?? ""), queryFn: ({ signal }) => getTaxRevision(id!, signal), enabled: !!id, retry: false, gcTime: 0 });
  const read = details.data;
  async function refreshList() {
    await queryClient.invalidateQueries({ queryKey: listKey });
  }
  function openRevision(revision: Revision) {
    queryClient.setQueryData(detailKey(revision.id), revision);
    setChoice(revision.id);
    setDirty(false);
  }
  async function saveRevision(id: string, editVersion: number, rules: RulePack) {
    const saved = await saveTaxDraft(id, editVersion, rules);
    // A list request started before the save can return an obsolete discard token.
    await queryClient.cancelQueries({ queryKey: listKey, exact: true });
    const { rules: _rules, legacy_snapshot: _legacy, preview: _preview, ...summary } = saved;
    queryClient.setQueryData<RevisionSummary[]>(listKey, (current) => current?.map((row) => (
      row.id === saved.id && row.status === "draft" && row.edit_version <= saved.edit_version
        ? summary : row
    )));
    return saved;
  }
  async function create(copy?: string) {
    if (!canWrite || year === "legacy" || dirty || lock.current) return;
    lock.current = true;
    setBusy(true); setError(undefined); setNotice("");
    try {
      const revision = await createTaxDraft(year, copy);
      openRevision(revision);
      setNotice(copy ? "Draft copied. Review it before publication." : "Draft opened. Published rules remain unchanged.");
      await refreshList();
    } catch (err) {
      setError(err);
      if (isConflict(err)) await refreshList();
    } finally { lock.current = false; setBusy(false); }
  }
  function beginDiscard(currentDraft: RevisionSummary, source?: Revision) {
    setPendingDiscard({ draft: currentDraft, source });
    setDiscardReason(""); setConfirmDiscard(false); setError(undefined); setNotice("");
  }
  async function discard() {
    if (!pendingDiscard || !confirmDiscard || !discardReason.trim() || !canWrite || dirty || lock.current) return;
    lock.current = true;
    setBusy(true); setError(undefined); setNotice("");
    try {
      const result = await discardTaxDraft(pendingDiscard.draft, discardReason, pendingDiscard.source?.id);
      openRevision(result.replacement ?? result.discarded);
      if (!result.replacement) setReadEpoch((value) => value + 1);
      setPendingDiscard(undefined);
      setNotice(result.replacement ? "Replacement draft created. The discarded draft remains in history; published rules are unchanged." : "Draft discarded and retained in history. Published rules are unchanged.");
      await refreshList();
    } catch (err) {
      setError(err);
      if (isConflict(err)) {
        setPendingDiscard(undefined);
        await refreshList();
        if (id) {
          await details.refetch();
          setReadEpoch((value) => value + 1);
        }
      }
    } finally { lock.current = false; setBusy(false); }
  }
  return <div className={"admin-workspace workspace-page-stack " + css.page}>
    <AdminPageHeader title="Tax Planner" description="Publishing a verified revision makes it the one active calculator for all visitors." />
    <p className={css.notice}>Active public calculator: {publicActive ? "AY " + publicActive.assessment_year + " · revision " + publicActive.revision_number : "No published rules"}. Publishing a verified revision activates it for everyone.</p>
    <div className={css.row}><Input label="New assessment year" value={newYear} placeholder="2028-29" onChange={setNewYear} /><Button disabled={!/^20\d{2}-\d{2}$/.test(newYear) || Number(newYear.slice(-2)) !== (Number(newYear.slice(0,4)) + 1) % 100 || dirty || busy} onClick={() => { setYear(newYear as Year); setChoice(undefined); }}>Manage year</Button></div>
    <section className={css.hero + " " + css.stack} aria-label="Assessment year and revision">
      <div className={css.fields}>
        <Select label="Assessment year" value={year} options={[...years, ...[...new Set((list.data ?? []).map((row) => row.assessment_year).filter((value): value is Year => !!value && !years.some(([key]) => key === value)))].map((key) => [key, "AY " + key] as const), ...(!years.some(([key]) => key === year) && year !== "legacy" && !(list.data ?? []).some((row) => row.assessment_year === year) ? [[year, "AY " + year] as const] : [])]} disabled={dirty || busy || !!pendingDiscard} onChange={(next) => { setYear(next); setChoice(undefined); setError(undefined); setNotice(""); }} />
        {!!rows.length && <Select label="Revision history" value={id ?? ""} options={rows.map((row) => [row.id, summaryLabel(row)] as const)} disabled={dirty || busy || !!pendingDiscard} onChange={setChoice} />}
      </div>
      <div className={css.row}>
        {active && <span className={css.pill}>Current: {summaryLabel(active)}</span>}
        {draft && <span className={css.pill}>Open: {summaryLabel(draft)}</span>}
        {!canWrite && <span className={css.pill}>Read-only access</span>}
      </div>
      {dirty && <p className={css.muted}>Save or discard your edits before switching revisions.</p>}
      {canWrite && year !== "legacy" && !list.isPending && !list.isError && !pendingDiscard && <div className={css.row}>
        <Button primary disabled={dirty || busy} onClick={() => draft ? setChoice(draft.id) : void create()}>{draft ? "Open existing draft" : "Create draft"}</Button>
        {read?.compatible && (read.status === "published" || read.status === "superseded") &&
          <Button disabled={dirty || busy} onClick={() => draft ? beginDiscard(draft, read) : void create(read.id)}>{draft ? "Replace draft with selected revision" : "Copy selected revision to draft"}</Button>}
        {draft && read?.id === draft.id && <Button disabled={dirty || busy} onClick={() => beginDiscard(draft)}>Discard saved draft</Button>}
      </div>}
      {pendingDiscard && <section aria-label="Confirm draft discard" className={css.card + " " + css.stack}>
        <h2>{pendingDiscard.source ? "Replace the saved draft?" : "Discard the saved draft?"}</h2>
        <p>{summaryLabel(pendingDiscard.draft)} · edit {pendingDiscard.draft.edit_version} will remain as a read-only audit record.
          {pendingDiscard.source && " A new draft will be copied from " + summaryLabel(pendingDiscard.source) + "."} Published rules will stay active.</p>
        <label className={css.field}><span>Reason for discarding this draft</span><textarea maxLength={500} disabled={busy} value={discardReason} onChange={(event) => setDiscardReason(event.target.value)} rows={2} /></label>
        <Check label="I confirm this saved draft can be discarded." checked={confirmDiscard} onChange={setConfirmDiscard} disabled={busy} />
        <div className={css.row}>
          <Button primary disabled={busy || !discardReason.trim() || !confirmDiscard} onClick={() => { void discard(); }}>{pendingDiscard.source ? "Discard and create replacement draft" : "Confirm discard saved draft"}</Button>
          <Button disabled={busy} onClick={() => setPendingDiscard(undefined)}>Cancel</Button>
        </div>
      </section>}
      {notice && <p role="status">{notice}</p>}
      {error != null && <p role="alert" className={css.notice}>{issueFromError(error)?.message ?? errorText(error)}</p>}
    </section>
    {(list.isPending || (id && details.isPending)) && <p role="status" className={css.notice}>Loading rule revisions…</p>}
    {(list.isError || details.isError) && <div role="alert" className={css.notice + " " + css.stack}>
      <p>Rule revisions are unavailable. Check that the v2 backend and migration are ready.</p>
      <div><Button onClick={() => { void list.refetch(); if (id) void details.refetch(); }}>Retry</Button></div>
    </div>}
    {!list.isPending && !list.isError && !id && <p className={css.notice}>{year === "legacy" ? "No legacy snapshot is archived." : "No revision has been created for this assessment year."}</p>}
    {read && <RevisionWorkspace key={read.id + ":" + readEpoch} initial={read} rows={rows} canWrite={canWrite} blocked={busy || !!pendingDiscard}
      onDirty={setDirty} onBusy={setBusy} onChange={openRevision} onSave={saveRevision} refreshList={refreshList} />}
  </div>;
}

function RevisionWorkspace({ initial, rows, canWrite, blocked, onDirty, onBusy, onChange, onSave, refreshList }: {
  initial: Revision; rows: RevisionSummary[]; canWrite: boolean; blocked: boolean;
  onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void; onChange: (revision: Revision) => void;
  onSave: typeof saveTaxDraft;
  refreshList: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [server, setServer] = useState(initial);
  const [rules, setRules] = useState(initial.rules);
  const [preview, setPreview] = useState<Preview>();
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState("");
  const [remote, setRemote] = useState<Revision>();
  const [conflict, setConflict] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [comparison, setComparison] = useState<Revision>();
  const [compareId, setCompareId] = useState("");
  const lock = useRef(false);
  const root = useRef<HTMLElement>(null);
  const writable = canWrite && server.status === "draft" && !!rules;
  const dirty = JSON.stringify(rules) !== JSON.stringify(server.rules);
  const active = rows.find((row) => row.status === "published");
  const publishable = !!(writable && !dirty && !conflict && preview?.publishable && preview.draft_id === server.id &&
    preview.preview.content_hash === server.content_hash && preview.preview.edit_version === server.edit_version &&
    preview.preview.against_published_revision_id === (active?.id ?? null) && reason.trim() && (!preview.preview.requires_acknowledgement || ack));

  function apply(revision: Revision) {
    setServer(revision); setRules(revision.rules); onChange(revision);
    setPreview(undefined); setConflict(false); setRemote(undefined);
    setAck(false); setError(undefined); setEditorEpoch((i) => i + 1);
  }
  function focusIssue(error: unknown) {
    const issue = issueFromError(error);
    if (!issue?.path) return;
    requestAnimationFrame(() => focusField(root.current, issue.path));
  }
  async function act(operation: () => Promise<void>, handleConflict = true) {
    if (lock.current || blocked) return;
    lock.current = true; onBusy(true); setError(undefined); setNotice("");
    try { await operation(); }
    catch (err) {
      setError(err); focusIssue(err);
      if (isConflict(err) && handleConflict) {
        setConflict(true); setPreview(undefined); setAck(false);
        try { setRemote(await getTaxRevision(server.id)); } catch { /* preserve unsaved input */ }
        await refreshList();
      }
    } finally { lock.current = false; onBusy(false); }
  }
  function edit(value: RulePack) {
    setRules(value); onDirty(JSON.stringify(value) !== JSON.stringify(server.rules));
    setPreview(undefined); setAck(false); setNotice("");
  }
  async function publish() {
    if (!preview || !publishable) return;
    const updated = await publishTaxDraft(server.id, preview.preview, reason, ack);
    apply(updated);
    setReason("");
    setNotice("Revision " + updated.revision_number + " published.");
    await refreshList();
    await queryClient.invalidateQueries({ queryKey: ["tax-planner-v2", "config"] });
    try {
      const config = await getTaxConfig();
      setNotice(config.selected?.identity.revision_id === updated.id
        ? "Revision " + updated.revision_number + " published and confirmed through the public API."
        : "Revision " + updated.revision_number + " published. The public API now reports another revision; check history.");
    } catch {
      setNotice("Revision " + updated.revision_number + " published. Public configuration is not currently available for verification.");
    }
  }
  const editIssue = issueFromError(error);
  const compareWith = rows.filter((row) => row.compatible && row.id !== server.id);
  return <section ref={root} className={css.panel + " " + css.stack} aria-label="Selected rule revision">
    <header className={css.stack}>
      <div className={css.row}><h2>{server.assessment_year ? "AY " + server.assessment_year : "Legacy configuration"}</h2><span className={css.pill}>{summaryLabel(server)}</span></div>
      {server.income_period_start && server.income_period_end && <p className={css.muted}>{dateLabel(server.income_period_start, "en")} – {dateLabel(server.income_period_end, "en")}</p>}
      <Rows items={[
        ["Content hash", <code className={css.pre}>{server.content_hash}</code>],
        ...(rules ? [["Reviewed on", dateLabel(rules.reviewed_on, "en")] as const] : []),
        ...(server.published_at ? [["Published", new Date(server.published_at).toLocaleString()] as const, ["Publisher", server.published_by_user_id ?? "—"] as const] : []),
        ...(server.change_reason ? [["Change reason", server.change_reason] as const] : []),
        ...(server.discarded_at ? [["Discarded", new Date(server.discarded_at).toLocaleString()] as const, ["Discarded by", server.discarded_by_user_id ?? "—"] as const, ["Discard reason", server.discard_reason ?? "—"] as const] : []),
      ]} />
      {server.sources.length > 0 && <div className={css.stack}>{server.sources.map((source) => <span key={source.id}><a href={sourceHref(source)} target="_blank" rel="noreferrer">{source.public_edition ?? "Official PDF"}</a>{" · Evidence: "}{source.edition}</span>)}</div>}
      {writable && <a href="#tax-v2-draft-workflow">Jump to draft actions</a>}
    </header>
    {error != null && <div role="alert" className={css.notice + " " + css.stack}>
      <p>{errorText(error)}</p>{editIssue?.message && <p>{editIssue.message}</p>}
      {conflict && <p>Your changes are preserved. Review the newer version and reload explicitly before editing or publishing again.</p>}
    </div>}
    {conflict && <div className={css.card + " " + css.stack}>
      {remote && <p>Server: {summaryLabel(remote)} · edit {remote.edit_version} · {remote.content_hash.slice(0, 12)}</p>}
      {remote?.rules && rules && <SnapshotComparison previous={remote.rules} proposed={rules} />}
      <div><Button disabled={blocked} onClick={() => { void act(async () => { apply(await getTaxRevision(server.id)); setNotice("Server revision loaded. Local edits were discarded."); }); }}>Reload server revision and discard local edits</Button></div>
    </div>}
    {notice && <p role="status" className={css.notice}>{notice}</p>}
    {server.legacy_snapshot && <details className={css.detail}><summary>Read-only legacy archive</summary><pre className={css.pre}>{display(server.legacy_snapshot)}</pre></details>}
    {!server.compatible && !server.legacy_snapshot && <p className={css.notice}>This snapshot is incompatible with the current calculation engine.</p>}
    {compareWith.length > 0 && rules && <details className={css.detail}><summary>Compare with another revision</summary>
      <div className={css.row}>
        <Select label="Compare with" value={compareId} options={[["", "Choose a revision"], ...compareWith.map((row) => [row.id, summaryLabel(row)] as const)]}
          disabled={blocked} onChange={(value) => { setCompareId(value); setComparison(undefined); }} />
        <Button disabled={!compareId || blocked} onClick={() => { void act(async () => setComparison(await getTaxRevision(compareId)), false); }}>Compare snapshots</Button>
      </div>
      {comparison?.rules && <SnapshotComparison previous={comparison.rules} proposed={rules} />}
    </details>}
    {rules && <RuleEditor key={editorEpoch} rules={rules} onChange={edit} disabled={!writable || blocked || conflict} />}
    {writable && <section id="tax-v2-draft-workflow" className={css.card + " " + css.stack} aria-label="Draft workflow">
      <h3>Draft workflow</h3>
      <p className={css.muted}>{dirty ? "Unsaved changes" : "Draft saved"} · Edit version {server.edit_version}</p>
      <div className={css.row}>
        <Button primary disabled={blocked || !dirty || conflict} onClick={() => { void act(async () => {
          if (!rules) return;
          apply(await onSave(server.id, server.edit_version, rules));
          setNotice("Draft saved. Preview these exact values before publishing.");
        }); }}>Save draft</Button>
        <Button disabled={blocked || !dirty || conflict} onClick={() => { apply(server); setNotice("Unsaved edits discarded."); }}>Discard unsaved edits</Button>
        <Button disabled={blocked || dirty || conflict} onClick={() => { void act(async () => {
          const compared = await previewTaxDraft(server.id, server.edit_version);
          setPreview(compared); setAck(false);
          setNotice(compared.publishable ? "Preview ready for review." : "Preview needs attention before publication.");
        }); }}>Validate and preview</Button>
      </div>
      {preview && <>
        <PreviewDetails value={preview} rules={rules!} />
        <label className={css.field}><span>Publication reason</span><textarea maxLength={500} disabled={blocked} value={reason} onChange={(event) => setReason(event.target.value)} rows={2} /></label>
        {preview.preview.requires_acknowledgement && <Check label="I reviewed and acknowledge the changed example results." checked={ack} onChange={setAck} disabled={blocked} />}
        {preview.preview.against_published_revision_id !== (active?.id ?? null) && <p className={css.notice}>The published revision changed. Preview again before publishing.</p>}
        <div><Button primary disabled={blocked || !publishable} onClick={() => { void act(publish); }}>Publish revision for AY {server.assessment_year} · make active</Button></div>
      </>}
    </section>}
  </section>;
}
function SnapshotComparison({ previous, proposed }: { previous: RulePack; proposed: RulePack }) {
  const keys = (Object.keys(proposed) as (keyof RulePack)[]).filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(proposed[key]));
  return <div className={css.stack}>{keys.length ? keys.map((key) => <details key={key} className={css.detail}><summary>{ruleLabel(key)}</summary>
    <div className={css.fields}><div><h3>Comparison revision</h3><pre className={css.pre}>{display(previous[key])}</pre></div><div><h3>Selected values</h3><pre className={css.pre}>{display(proposed[key])}</pre></div></div>
  </details>) : <p>No rule changes between these snapshots.</p>}</div>;
}
function PreviewDetails({ value, rules }: { value: Preview; rules: RulePack }) {
  const deltaCases = value.cases.filter((row) => row.changed_checkpoints.length || row.differing_from_source.length);
  return <div className={css.stack}>
    <p>Previewed AY {rules.assessment_year} · {rules.income_period_start} to {rules.income_period_end} · edit {value.preview.edit_version}</p>
    <code className={css.pre}>{value.preview.content_hash}</code>
    <p className={css.muted}>{value.cases.length} examples checked · {deltaCases.length} with deltas</p>
    <Rows items={[["General threshold", bdt(rules.thresholds.general, "en")], ["সাধারণ করমুক্ত সীমা", bdt(rules.thresholds.general, "bn")]]} />
    {value.preview.missing_source_rules.length > 0 && <p role="alert" className={css.notice}>Update the official evidence for: {value.preview.missing_source_rules.map(ruleLabel).join(", ")}.</p>}
    {value.preview.invariant_issues.length > 0 && <p role="alert" className={css.notice}>Validation issues: {value.preview.invariant_issues.map(ruleLabel).join(", ")}.</p>}
    <details className={css.detail} open={value.config_changes.length > 0}><summary>Changed configuration ({value.config_changes.length})</summary>
      {value.config_changes.map((change) => <details className={css.detail} key={change.field}><summary>{ruleLabel(change.field)}</summary>
        <div className={css.fields}><div><h3>Previous</h3><pre className={css.pre}>{display(change.previous)}</pre></div>
          <div><h3>Proposed</h3><pre className={css.pre}>{display(change.proposed)}</pre></div></div>
      </details>)}
    </details>
    <details className={css.detail} open={deltaCases.length > 0}><summary>Example output comparisons</summary>
      {value.cases.map((row) => <details className={css.detail} key={row.case_id}><summary>{row.case_id} · {row.source}{row.changed_checkpoints.length ? " (changed)" : ""}</summary>
        <div className={css.scroll}><table className={css.table}><thead><tr><th>Checkpoint</th><th>Source</th><th>Previous</th><th>Proposed</th></tr></thead>
          <tbody>{Object.keys(row.proposed).map((key) => <tr key={key}><th scope="row">{ruleLabel(key)}</th><td>{display(row.source_expected[key])}</td><td>{display(row.previous[key])}</td><td>{display(row.proposed[key])}</td></tr>)}</tbody>
        </table></div>
      </details>)}
    </details>
  </div>;
}

