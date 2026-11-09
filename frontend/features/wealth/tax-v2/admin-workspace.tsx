"use client";

import { createPortal } from "react-dom";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { useAuth } from "@/features/auth/context/auth-context";
import { BackendApiError } from "@/lib/api/backend-api-client";
import { createTaxDraft, discardTaxDraft, getTaxConfig, getTaxRevision, issueFromError, listTaxRevisions, previewTaxDraft, publishTaxDraft, saveTaxDraft } from "./api";
import type { Preview, Revision, RevisionSummary, RulePack, Year } from "./contracts";
import { Input, bdt, Button, Check, dateLabel, Rows, Select } from "./fields";
import { AdminPanel } from "./admin-panel";
import { RuleEditor } from "./rule-editor";
import { focusField } from "./focus-field";
import css from "./tax.module.css";
import { adminTabs, adminValidationMessage, tabForPath, RuleFieldErrors, type AdminTab } from "./admin-fields";
import "./admin-workspace.css";

const statusLabels: Record<RevisionSummary["status"], string> = { draft: "Draft", published: "Published", superseded: "Superseded", discarded: "Discarded draft", archived_legacy: "Archived legacy" };
const summaryLabel = (row: RevisionSummary) => "Revision " + row.revision_number + " · " + statusLabels[row.status];
const publishedDate = (value:string) => new Date(value).toLocaleString("en-GB",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"}) + " · Dhaka";
const ruleLabel = (value: string) => value.replaceAll(".", " · ").replaceAll("_", " ");
const years: [Year | "legacy", string][] = [["2026-27", "AY 2026–27"], ["2027-28", "AY 2027–28"], ["legacy", "Legacy archive"]];
const errorText = (error: unknown) => error instanceof BackendApiError ? error.message : "The request could not be completed. Try again.";
const isConflict = (error: unknown) => error instanceof BackendApiError && error.status === 409;
const display = (value: unknown) => value == null ? "—" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
const DiscardConfirmation = createContext<(message:string)=>Promise<boolean>>(async()=>false);
function useDiscardConfirmation() {
  const [message,setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const resolve = useRef<((value:boolean)=>void) | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const ask = useCallback((text:string) => new Promise<boolean>(done=>{
    resolve.current?.(false);opener.current=document.activeElement as HTMLElement;resolve.current=done;setMessage(text);
  }),[]);
  const finish = (value:boolean) => { dialog.current?.close?.();dialog.current?.removeAttribute("open");setMessage("");resolve.current?.(value);resolve.current=null;opener.current?.focus(); };
  useEffect(()=>{
    if(!message || !dialog.current) return;
    if(dialog.current.showModal) dialog.current.showModal(); else dialog.current.setAttribute("open","");
    dialog.current.querySelector<HTMLElement>("button")?.focus();
  },[message]);
  useEffect(()=>()=>{resolve.current?.(false)},[]);
  return {ask,confirmation:<dialog ref={dialog} className="tax-admin-confirmation" aria-labelledby="tax-discard-title" aria-describedby="tax-discard-message" onCancel={event=>{event.preventDefault();finish(false)}}><h2 id="tax-discard-title">Discard unsaved edits?</h2><p id="tax-discard-message">{message}</p><div><Button onClick={()=>finish(false)}>Keep editing</Button><Button primary onClick={()=>finish(true)}>Discard edits</Button></div></dialog>};
}

function AdminMenu({className,label,children}:{className:string;label:string;children:ReactNode}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const close = (event:PointerEvent) => { if(ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open=false; };
    const escape = (event:KeyboardEvent) => { if(event.key==="Escape" && ref.current?.open) {ref.current.open=false;ref.current.querySelector("summary")?.focus();} };
    document.addEventListener("pointerdown",close);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",escape)};
  },[]);
  return <details ref={ref} className={className}><summary>{label}</summary>{children}</details>;
}

export function TaxPlannerV2Admin() {
  const { user } = useAuth();
  if (!user) return null;
  return <AdminSession key={user.id} account={user.id} canWrite={user.role === "SUPER_ADMIN"} />;
}
function AdminSession({ account, canWrite }: { account: string; canWrite: boolean }) {
  const {ask,confirmation} = useDiscardConfirmation();
  const allowExit = useRef(false);
  const queryClient = useQueryClient();
  const listKey = ["tax-planner-v2", "admin", account, "revisions"];
  const detailKey = (id: string) => ["tax-planner-v2", "admin", account, "revision", id];
  const [actionHost,setActionHost] = useState<HTMLDivElement | null>(null);
  const [headerHeight,setHeaderHeight] = useState(150);
  const selection = useRef<HTMLElement>(null);
  const [selectionNode,setSelectionNode]=useState<HTMLElement|null>(null);
  const selectionRef=useCallback((node:HTMLElement|null)=>{selection.current=node;setSelectionNode(node)},[]);
  useEffect(()=>{const node=selectionNode;if(!node || typeof ResizeObserver === "undefined")return;const measure=()=>{const height=node.getBoundingClientRect().height;if(height>0)setHeaderHeight(height)};measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect()},[selectionNode]);
  const [pendingCreation,setPendingCreation]=useState<{copy?:string}|null>(null);
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
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { if(!allowExit.current){event.preventDefault(); event.returnValue = "";} };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest("a[href]") as HTMLAnchorElement | null;
      if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && link.target !== "_blank" && (link.pathname !== location.pathname || link.search !== location.search)) {
        event.preventDefault(); event.stopPropagation();
        void ask("Your tax configuration changes have not been saved. Leave this page and discard them?").then(accepted=>{if(accepted){allowExit.current=true;location.assign(link.href);}});
      }
    };
    // Same-document Back/Forward does not fire beforeunload. Use the browser's
    // cancellable traversal event when available; full loads use beforeunload.
    const navigation = (window as Window & {navigation?: EventTarget & {traverseTo?:(key:string)=>unknown}}).navigation;
    const traverse = (event: Event) => {
      const next = event as Event & {navigationType?:string;destination?:{url:string;sameDocument:boolean;key:string}};
      if(allowExit.current || next.navigationType!=="traverse" || !next.cancelable || !next.destination?.sameDocument || !navigation?.traverseTo) return;
      const url = new URL(next.destination.url);
      if(url.pathname!==location.pathname || url.search!==location.search) {
        next.preventDefault();void ask("Your tax configuration changes have not been saved. Leave this page and discard them?").then(accepted=>{if(accepted){allowExit.current=true;navigation.traverseTo?.(next.destination!.key);}});
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    navigation?.addEventListener("navigate",traverse);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true);navigation?.removeEventListener("navigate",traverse); };
  }, [dirty,ask]);
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
  function closeMenus() { selection.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(node=>{node.open=false}); }
  async function allowSwitch() {
    if (dirty && !await ask("Switching the assessment year or revision will discard your unsaved configuration changes.")) return false;
    setDirty(false);closeMenus(); return true;
  }
  async function refreshList() {
    await queryClient.invalidateQueries({ queryKey: listKey });
  }
  function openRevision(revision: Revision) {
    closeMenus();
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
  function proposeCreate(copy?:string){closeMenus();setPendingCreation({copy});}
  const startingRevision=pendingCreation?.copy ? (list.data ?? []).find(r=>r.id===pendingCreation.copy) : active ?? (!["2026-27","2027-28"].includes(year) ? publicActive : undefined);
  function beginDiscard(currentDraft: RevisionSummary, source?: Revision) {
    closeMenus();
    setPendingDiscard({ draft: currentDraft, source });
    setDiscardReason(""); setConfirmDiscard(false); setError(undefined); setNotice("");
  }
  async function discard() {
    if (!pendingDiscard || !confirmDiscard || !discardReason.trim() || !canWrite || dirty || lock.current) return;
    lock.current = true;
    setBusy(true); setError(undefined); setNotice("");
    try {
      const result = await discardTaxDraft(pendingDiscard.draft, discardReason, pendingDiscard.source?.id);
      queryClient.setQueryData(detailKey(result.discarded.id),result.discarded);
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
  return <DiscardConfirmation.Provider value={ask}><div className={"admin-workspace workspace-page-stack tax-admin-workspace " + css.page} style={{"--tax-header-height":headerHeight+10+"px"} as React.CSSProperties}>
    <AdminPageHeader title="Tax Planner" description="Publishing a verified revision makes it the one active calculator for all visitors." />
    <section ref={selectionRef} className={css.hero + " " + css.stack + " tax-admin-selection"} aria-label="Assessment year and revision">
    <p className="tax-admin-active">Active for visitors: {publicActive ? "AY " + publicActive.assessment_year + " · revision " + publicActive.revision_number : list.isPending ? "Loading…" : list.isError ? "Unavailable · published rules have not been changed" : "No published rules"}.</p>
      <div className={css.fields + " tax-admin-selectors"}>
        <Select label="Assessment year" value={year} options={[...years, ...[...new Set((list.data ?? []).map((row) => row.assessment_year).filter((value): value is Year => !!value && !years.some(([key]) => key === value)))].map((key) => [key, "AY " + key] as const), ...(!years.some(([key]) => key === year) && year !== "legacy" && !(list.data ?? []).some((row) => row.assessment_year === year) ? [[year, "AY " + year] as const] : [])]} disabled={busy || !!pendingDiscard || !!pendingCreation} onChange={async(next) => { if(!await allowSwitch()) return; setYear(next); setChoice(undefined); setError(undefined); setNotice(""); }} />
        {!!rows.length && <Select label="Revision history" value={id ?? ""} options={rows.map((row) => [row.id, summaryLabel(row)] as const)} disabled={busy || !!pendingDiscard || !!pendingCreation} onChange={async next=>{if(await allowSwitch()) setChoice(next)}} />}
      <div className="tax-admin-primary-action" ref={setActionHost}>{canWrite && !list.isPending && !list.isError && !(id && details.isPending) && !details.isError && year!=="legacy" && read?.status!=="draft" && <Button primary disabled={dirty||busy||!!pendingDiscard} onClick={()=>draft?setChoice(draft.id):proposeCreate()}>{draft ? "Open existing draft" : "Create draft"}</Button>}</div>
      </div>
      <div className={css.row+" tax-admin-selection-status"}>
        {read && <span className={css.pill}>Viewing {summaryLabel(read)} · {read.status==="draft" && canWrite ? "Editable draft" : "Read only"}</span>}
        {draft && draft.id!==read?.id && <span className={css.pill}>Draft available: revision {draft.revision_number}</span>}
        {!canWrite && <span className={css.pill}>Read-only access</span>}
      </div>
      {dirty && <p className={css.muted}>Unsaved edits · switching year or revision will ask before discarding them.</p>}
      <AdminMenu className="tax-admin-secondary" label="Manage years"><div className={css.row}><Input label="New assessment year" value={newYear} placeholder="2028-29" onChange={setNewYear} /><Button disabled={!/^20\d{2}-\d{2}$/.test(newYear) || Number(newYear.slice(-2)) !== (Number(newYear.slice(0,4)) + 1) % 100 || dirty || busy} onClick={() => { setYear(newYear as Year); setChoice(undefined);setNotice("");setError(undefined);closeMenus(); }}>Manage year</Button></div></AdminMenu>
      {canWrite && year !== "legacy" && !list.isPending && !list.isError && !pendingDiscard && <AdminMenu className="tax-admin-draft-options" label="Draft actions"><div className={css.row}>
        <p>Create draft uses the year’s current publication or baseline. Copy selected revision uses the exact selected snapshot. Future years inherit the latest publication.</p>
        {read?.compatible && (read.status === "published" || read.status === "superseded") &&
          <Button disabled={dirty || busy} onClick={() => draft ? beginDiscard(draft, read) : proposeCreate(read.id)}>{draft ? "Replace draft with selected revision" : "Copy selected revision to draft"}</Button>}
        {draft && read?.id === draft.id && <Button disabled={dirty || busy} onClick={() => beginDiscard(draft)}>Discard saved draft</Button>}
      </div></AdminMenu>}
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
    </section>
      {notice && <p role="status">{notice}</p>}
      {error != null && <p role="alert" className={css.notice}>{issueFromError(error)?.message ?? errorText(error)}</p>}
    {(list.isPending || (id && details.isPending)) && <p role="status" className={css.notice}>Loading rule revisions…</p>}
    {(list.isError || details.isError) && <div role="alert" className={css.notice + " " + css.stack}>
      <p>Rule revisions are unavailable. Check that the v2 backend and migration are ready.</p>
      <div><Button onClick={() => { void list.refetch(); if (id) void details.refetch(); }}>Retry</Button></div>
    </div>}
    {!list.isPending && !list.isError && !id && <p className={css.notice}>{year === "legacy" ? "No legacy snapshot is archived." : "No revision has been created for this assessment year."}</p>}
    {read && <RevisionWorkspace key={read.id + ":" + readEpoch} initial={read} rows={rows} canWrite={canWrite} blocked={busy || !!pendingDiscard}
      actionHost={actionHost} onDirty={value=>{setDirty(value);if(value)setNotice("");}} onBusy={setBusy} onChange={openRevision} onSave={saveRevision} refreshList={refreshList} publicActive={publicActive} />}
  </div><AdminPanel title={pendingCreation?.copy ? "Copy selected revision to a draft" : "Create draft from current publication/baseline"} open={!!pendingCreation} onClose={()=>setPendingCreation(null)}><p>Target assessment year: {year}</p><h3>Starting content</h3><p>{startingRevision ? "AY "+startingRevision.assessment_year+" · "+summaryLabel(startingRevision) : "Verified baseline for AY "+year+" · no stored starting revision"}</p>{startingRevision && <details><summary>Starting revision audit</summary><p>{startingRevision.id}</p><code>{startingRevision.content_hash}</code></details>}<p>{pendingCreation?.copy ? "Copies this exact selected same-year snapshot, including historical values." : "Uses this year’s current publication when available, otherwise its verified baseline. New future years inherit the latest publication and receive an empty filing calendar."}</p><p>Visitors keep their active revision until a draft is saved, validated and explicitly published.</p><Button primary disabled={busy} onClick={()=>{const copy=pendingCreation?.copy;setPendingCreation(null);void create(copy)}}>Confirm create draft</Button></AdminPanel>{confirmation}</DiscardConfirmation.Provider>;
}

function RevisionWorkspace({ initial, rows, canWrite, blocked, onDirty, onBusy, onChange, onSave, refreshList, actionHost, publicActive }: {
  publicActive?: RevisionSummary;
  actionHost: HTMLDivElement | null;
  initial: Revision; rows: RevisionSummary[]; canWrite: boolean; blocked: boolean;
  onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void; onChange: (revision: Revision) => void;
  onSave: typeof saveTaxDraft;
  refreshList: () => Promise<void>;
}) {
  const confirmDiscard = useContext(DiscardConfirmation);
  const queryClient = useQueryClient();
  const [server, setServer] = useState(initial);
  const [tab, setTab] = useState<AdminTab>("Overview");
  const [focusPath, setFocusPath] = useState("");
  const [focusEpoch,setFocusEpoch] = useState(0);
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const tabStrip=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const strip=tabStrip.current;if(!strip)return;
    const reveal=()=>{
      const button=tabButtons.current[adminTabs.indexOf(tab)];if(!button)return;
      const bounds=strip.getBoundingClientRect(), item=button.getBoundingClientRect();
      if(item.left<bounds.left+8) strip.scrollLeft+=item.left-bounds.left-8;
      else if(item.right>bounds.right-8) strip.scrollLeft+=item.right-bounds.right+8;
    };
    reveal();if(typeof ResizeObserver==="undefined")return;
    const observer=new ResizeObserver(reveal);observer.observe(strip);return()=>observer.disconnect();
  },[tab]);
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
  function selectTab(next:AdminTab) {setTab(next);requestAnimationFrame(()=>root.current?.querySelector<HTMLElement>('.tax-admin-content:not([hidden])')?.scrollIntoView?.({block:"start",behavior:"instant"}));}
  function focusIssue(error: unknown) {
    const issue = issueFromError(error);
    if (!issue?.path) return;
    goToField(issue.path);
  }
  function goToField(path: string) {
    setTab(tabForPath(path)); setFocusPath(path);setFocusEpoch(value=>value+1);
    requestAnimationFrame(() => { focusField(root.current,path); (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-path]")?.scrollIntoView?.({block:"start",behavior:"instant"}); });
  }
  const changedTabs = new Set(rules && server.rules ? (Object.keys(rules) as (keyof RulePack)[]).filter(key => JSON.stringify(rules[key]) !== JSON.stringify(server.rules![key])).map(key => tabForPath(key)) : []);
  async function save() {
    if (!rules || !dirty || conflict || !writable) return;
    await act(async () => { apply(await onSave(server.id, server.edit_version, rules)); setNotice("Draft saved. Preview these exact values before publishing."); });
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
    const changed=JSON.stringify(value) !== JSON.stringify(server.rules);
    setRules(value); onDirty(changed);
    if(!changed) setError(undefined);
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
  const fieldIssues = error instanceof BackendApiError && Array.isArray(error.details?.errors) ? error.details.errors.flatMap((item: {loc?:unknown[];msg?:string})=>{
    const path=item.loc?.filter(part=>part!=="body" && part!=="query").join(".");
    return path ? [{path,message:adminValidationMessage(path,item.msg || "Check this value")}] : [];
  }) : editIssue?.path ? [{...editIssue,message:adminValidationMessage(editIssue.path,editIssue.message || "Check this value")}] : [];
  const errorTabs = new Set(fieldIssues.map(issue=>tabForPath(issue.path)));
  if(preview?.preview.missing_source_rules.length) errorTabs.add("Sources & evidence");
  if(preview && !preview.publishable) errorTabs.add("Review & publish");
  const compareWith = rows.filter((row) => row.compatible && row.id !== server.id);
  return <section ref={root} className={css.panel + " " + css.stack} aria-label="Selected rule revision">
    <div className="tax-admin-sticky">
      {actionHost && writable && createPortal(<div className="tax-admin-save-control"><small>{dirty ? "Unsaved changes" : "All changes saved"} · edit {server.edit_version}</small><Button primary disabled={blocked || !dirty || conflict} onClick={()=>void save()}>Save draft</Button></div>,actionHost)}
      <div ref={tabStrip} role="tablist" aria-label="Tax configuration sections" className="tax-admin-tabs">
        {adminTabs.map((name,i) => <button key={name} ref={node => {tabButtons.current[i] = node;}} id={"tax-tab-"+i} role="tab" aria-label={name + (changedTabs.has(name) ? " · unsaved changes" : "") + (errorTabs.has(name) ? " · validation error" : "")} aria-selected={tab===name} aria-controls={"tax-panel-"+i} tabIndex={tab===name?0:-1} onClick={()=>selectTab(name)} onKeyDown={event=>{
          const next = event.key === "ArrowRight" ? (i+1)%adminTabs.length : event.key === "ArrowLeft" ? (i+adminTabs.length-1)%adminTabs.length : event.key === "Home" ? 0 : event.key === "End" ? adminTabs.length-1 : -1;
          if(next>=0){event.preventDefault();selectTab(adminTabs[next]);tabButtons.current[next]?.focus();}
        }}>{name}{changedTabs.has(name) && <span className="tax-admin-dot" aria-label="Unsaved changes">•</span>}{errorTabs.has(name) && <span className="tax-admin-error" aria-label="Validation error">!</span>}</button>)}
      </div>
    </div>
    {adminTabs.slice(1,6).filter(name=>name!==tab).map(name=><div key={name} role="tabpanel" id={"tax-panel-"+adminTabs.indexOf(name)} aria-labelledby={"tax-tab-"+adminTabs.indexOf(name)} hidden/>)}
    <div role="tabpanel" id="tax-panel-0" aria-labelledby="tax-tab-0" hidden={tab!=="Overview"} className="tax-admin-content">
      <div className="tax-admin-section-heading"><div><span className="tax-admin-eyebrow">Revision overview</span><h2>{server.assessment_year ? "Assessment year " + server.assessment_year : "Legacy configuration"}</h2><p className={css.muted}>Review the selected snapshot before making a new revision.</p></div><span className={css.pill}>{summaryLabel(server)}</span></div>
      <div className="tax-admin-overview-grid"><Rows items={[
        ["Income period", server.income_period_start && server.income_period_end ? dateLabel(server.income_period_start,"en") + " – " + dateLabel(server.income_period_end,"en") : "Not specified"],
        ["Reviewed on", rules ? dateLabel(rules.reviewed_on,"en") : "Not specified"],
        ["Change reason", server.change_reason || "No publication reason recorded"],
        ["Published", server.published_at ? publishedDate(server.published_at) : "Not published"],
        ...(server.discarded_at ? [["Discarded",publishedDate(server.discarded_at)] as const,["Discard reason",server.discard_reason ?? "—"] as const] : []),
      ]}/><aside className="tax-admin-context"><h3>{!canWrite ? "Read-only workspace" : writable ? "A safe place to prepare changes" : "A versioned record"}</h3><p>{!canWrite ? "You can inspect rules, sources and revision history. A super admin must prepare and publish changes." : writable ? "Save your edits, validate the saved draft, then review and publish. Saving never changes the public calculator." : "Published rules are read-only. Create draft uses the year’s current publication or baseline; Copy selected revision preserves the selected snapshot."}</p><Button onClick={()=>selectTab(writable ? "Tax rules" : "Review & publish")}>{writable ? "Edit tax rules →" : "Review publication →"}</Button></aside></div>
      <h3>Revision & publication history</h3><div className={css.scroll}><table className={css.table}><thead><tr><th>Revision</th><th>Status</th><th>Published</th><th>Change reason</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><th scope="row">{row.revision_number}{row.id===server.id ? " · selected" : ""}</th><td>{statusLabels[row.status]}</td><td>{row.published_at ? publishedDate(row.published_at) : "Not published"}</td><td>{row.change_reason || "—"}</td></tr>)}</tbody></table></div>
      <details className={css.detail}><summary>Audit details</summary><Rows items={[["Revision ID",server.id],["Content hash",<code className={css.pre}>{server.content_hash}</code>],["Publisher ID",server.published_by_user_id || "Not published"],["Created by",server.created_by_user_id || "—"],["Updated by",server.updated_by_user_id || "—"],["Copied from",server.copied_from_revision_id || "Standard rules"],...(server.discarded_by_user_id ? [["Discarded by",server.discarded_by_user_id] as const] : [])]}/></details>
    </div>
    {error != null && <div role="alert" className={css.notice + " " + css.stack}>
      <p>{errorText(error)}</p>{fieldIssues.length ? fieldIssues.map((issue,i)=><Button key={i} onClick={()=>goToField(issue.path)}>{issue.message} · {ruleLabel(issue.path)} →</Button>) : editIssue?.message && <p>{editIssue.message}</p>}
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
    <div role="tabpanel" id="tax-panel-6" aria-labelledby="tax-tab-6" hidden={tab!=="Review & publish"} className="tax-admin-content">
    <h2>Review & publish</h2>
    {rules && (writable ? <Input disabled={blocked || conflict} type="date" label="Rules reviewed on" invalid={fieldIssues.some(issue=>issue.path==="rules.reviewed_on")} help={fieldIssues.find(issue=>issue.path==="rules.reviewed_on")?.message} path="rules.reviewed_on" value={rules.reviewed_on} onChange={reviewed_on=>edit({...rules,reviewed_on})}/> : <p>Rules reviewed on {dateLabel(rules.reviewed_on,"en")}</p>)}
    {!writable && <div className="tax-admin-formula"><h3>Publication record</h3><Rows items={[["Viewing",summaryLabel(server)+" · Read only"],["Active for visitors",publicActive ? "AY "+publicActive.assessment_year+" · revision "+publicActive.revision_number : "No publication available"],["Publication date",server.published_at ? publishedDate(server.published_at) : "Not published"],["Publication reason",server.change_reason || "Not recorded"],["Review date",rules ? dateLabel(rules.reviewed_on,"en") : "Not recorded"],["Evidence coverage",(rules?.sources.length ?? 0)+" document editions · "+(rules?.rule_references.length ?? 0)+" rule references"]]}/><p>Publication records do not imply that unsaved changes have been validated. To change this snapshot, prepare a draft and run a fresh validation.</p></div>}
    {compareWith.length > 0 && rules && <details className={css.detail}><summary>Compare with another revision</summary>
      <div className={css.row}>
        <Select label="Compare with" value={compareId} options={[["", "Choose a revision"], ...compareWith.map((row) => [row.id, summaryLabel(row)] as const)]}
          disabled={blocked} onChange={(value) => { setCompareId(value); setComparison(undefined); }} />
        <Button disabled={!compareId || blocked} onClick={() => { void act(async () => setComparison(await getTaxRevision(compareId)), false); }}>Compare snapshots</Button>
      </div>
      {comparison?.rules && <SnapshotComparison previous={comparison.rules} proposed={rules} />}
    </details>}
    {writable && <section id="tax-v2-draft-workflow" className={css.card + " " + css.stack} aria-label="Draft workflow">
      <h3>Draft workflow</h3>
      <p className={css.muted}>{dirty ? "Unsaved changes" : "Draft saved"} · Edit version {server.edit_version}</p>
      <div className={css.row}>
        <Button disabled={blocked || !dirty || conflict} onClick={() => { void confirmDiscard("Restore the saved draft and discard all local configuration edits?").then(accepted=>{if(accepted){apply(server);setNotice("Unsaved edits discarded.");}}); }}>Discard unsaved edits</Button>
        <Button disabled={blocked || dirty || conflict} onClick={() => { void act(async () => {
          const compared = await previewTaxDraft(server.id, server.edit_version);
          setPreview(compared); setAck(false);
          setNotice(compared.publishable ? "Preview ready for review." : "Preview needs attention before publication.");
        }); }}>Validate and preview</Button>
      </div>
      {preview && <>
        <PreviewDetails value={preview} rules={rules!} onField={goToField} />
        <label className={css.field}><span>Publication reason</span><textarea maxLength={500} disabled={blocked} value={reason} onChange={(event) => setReason(event.target.value)} rows={2} /></label>
        {preview.preview.requires_acknowledgement && <Check label="I reviewed and acknowledge the changed example results." checked={ack} onChange={setAck} disabled={blocked} />}
        {preview.preview.against_published_revision_id !== (active?.id ?? null) && <p className={css.notice}>The published revision changed. Preview again before publishing.</p>}
        <p className={css.notice}>Publishing AY {server.assessment_year} · revision {server.revision_number} makes this exact saved revision active for all visitors.</p>
        <div><Button primary disabled={blocked || !publishable} onClick={() => { void act(publish); }}>Publish revision for AY {server.assessment_year} · make active</Button></div>
      </>}
    </section>}
    </div>
    {rules && <div role="tabpanel" id={"tax-panel-"+(tab==="Overview" || tab==="Review & publish" ? "editor" : adminTabs.indexOf(tab))} aria-labelledby={"tax-tab-"+adminTabs.indexOf(tab)} hidden={tab==="Overview" || tab==="Review & publish"} className="tax-admin-content"><RuleFieldErrors.Provider value={Object.fromEntries(fieldIssues.map(issue=>[issue.path,issue.message || "Check this value"]))}><RuleEditor key={editorEpoch} rules={rules} onChange={edit} disabled={!writable || blocked || conflict} readOnly={!writable} section={tab} focusPath={focusPath} focusEpoch={focusEpoch}/></RuleFieldErrors.Provider></div>}
  </section>;
}
function SnapshotComparison({ previous, proposed }: { previous: RulePack; proposed: RulePack }) {
  const keys = (Object.keys(proposed) as (keyof RulePack)[]).filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(proposed[key]));
  return <div className={css.stack}>{keys.length ? keys.map((key) => <details key={key} className={css.detail}><summary>{ruleLabel(key)}</summary>
    <div className={css.fields}><div><h3>Comparison revision</h3><pre className={css.pre}>{display(previous[key])}</pre></div><div><h3>Selected values</h3><pre className={css.pre}>{display(proposed[key])}</pre></div></div>
  </details>) : <p>No rule changes between these snapshots.</p>}</div>;
}
function PreviewDetails({ value, rules, onField }: { value: Preview; rules: RulePack; onField: (path:string)=>void }) {
  function focusCase(issue:string) {
    const node = document.getElementById("tax-preview-case-"+issue.split(":")[0]);
    for(let element:HTMLElement|null=node; element; element=element.parentElement) if(element instanceof HTMLDetailsElement) element.open=true;
    node?.querySelector("summary")?.focus();
  }
  const deltaCases = value.cases.filter((row) => row.changed_checkpoints.length || row.differing_from_source.length);
  return <div className={css.stack}>
    <p>Previewed AY {rules.assessment_year} · {rules.income_period_start} to {rules.income_period_end} · edit {value.preview.edit_version}</p>
    <details className={css.detail}><summary>Validation audit</summary><code className={css.pre}>{value.preview.content_hash}</code><p>Validated {publishedDate(value.preview.previewed_at)}</p></details>
    <p className={css.muted}>{value.cases.length} examples checked · {deltaCases.length} with deltas</p>
    <Rows items={[["General threshold", bdt(rules.thresholds.general, "en")], ["সাধারণ করমুক্ত সীমা", bdt(rules.thresholds.general, "bn")]]} />
    {value.preview.missing_source_rules.length > 0 && <p role="alert" className={css.notice}>Update the official evidence for: {value.preview.missing_source_rules.map((rule)=><button className="tax-admin-text-action" key={rule} onClick={()=>onField("rules.rule_references."+Math.max(0,rules.rule_references.findIndex(row=>row.id===rule)))}>{ruleLabel(rule)} →</button>)}.</p>}
    {value.preview.invariant_issues.length > 0 && <p role="alert" className={css.notice}>Validation issues: {value.preview.invariant_issues.map(issue=><button className="tax-admin-text-action" key={issue} onClick={()=>focusCase(issue)}>{ruleLabel(issue)} →</button>)}.</p>}
    <details className={css.detail} open={value.config_changes.length > 0}><summary>Changed configuration ({value.config_changes.length})</summary>
      {value.config_changes.map((change) => <details className={css.detail} key={change.field}><summary>{ruleLabel(change.field)}</summary>
        <div className={css.fields}><div><h3>Previous</h3><pre className={css.pre}>{display(change.previous)}</pre></div>
          <div><h3>Proposed</h3><pre className={css.pre}>{display(change.proposed)}</pre></div></div>
      </details>)}
    </details>
    <details className={css.detail} open={deltaCases.length > 0}><summary>Example output comparisons</summary>
      {value.cases.map((row) => <details id={"tax-preview-case-"+row.case_id} className={css.detail} key={row.case_id}><summary>{row.case_id} · {row.source}{row.changed_checkpoints.length ? " (changed)" : ""}</summary>
        <div className={css.scroll}><table className={css.table}><thead><tr><th>Checkpoint</th><th>Source</th><th>Previous</th><th>Proposed</th></tr></thead>
          <tbody>{Object.keys(row.proposed).map((key) => <tr key={key}><th scope="row">{ruleLabel(key)}</th><td>{display(row.source_expected[key])}</td><td>{display(row.previous[key])}</td><td>{display(row.proposed[key])}</td></tr>)}</tbody>
        </table></div>
      </details>)}
    </details>
  </div>;
}
