import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type FileEntry = { id: number; filename: string; url: string; content_type: string; size_bytes: number; kind: string };
type Tender = {
  source?: string;
  tender_id: string; title: string | null; organisation_chain: string | null;
  tender_category: string | null; tender_type: string | null; tender_value_inr: string | null;
  published_at: string | null; bid_submission_end_at: string | null;
  location: string | null; authority: string | null; files: FileEntry[];
};
type ChecklistItem = {
  action: string; category: string; status: string; condition: string | null;
  lot_reference: string | null; amount_inr: string | null; deadline: string | null;
  submission_method: string | null; envelope: string | null;
  source: { pdf_page: number; printed_page: string | null; original_excerpt: string | null };
};
type Checklist = {
  checklist: ChecklistItem[];
  post_award: ChecklistItem[];
  milestones: { event: string; date_time: string | null }[];
  lots: { reference: string; title: string; tender_fee_inr: string | null;
    bid_security_amount_inr: string | null; bid_security_form: string | null }[];
  coverage: { referenced_documents: string[]; needs_review: string[] };
  other: { summary: string; additional_details: { label: string; value: string }[] };
};
type ChecklistState = { status: "loading" } | { status: "ready"; data: Checklist }
  | { status: "error"; message: string };

type Catalog = { items: Tender[]; total: number };
type Sort = "relevant" | "recent" | "closing";

const icons = {
  layers: "M12 3 2 8l10 5 10-5-10-5ZM2 12l10 5 10-5M2 16l10 5 10-5",
  search: "M21 21l-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  pin: "M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  clock: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6l4 2",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  tune: "M4 7h16M4 17h16M8 4v6m8 4v6",
  file: "M6 3h8l4 4v14H6zM14 3v5h4m-9 4h6m-6 4h6",
  close: "m6 6 12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  requirement: "M12 22s7-3 7-9V5l-7-3-7 3v8c0 6 7 9 7 9ZM12 8v4m0 4h.01",
  rupee: "M6 4h12M6 8h12M6 4h4a5 5 0 0 1 0 10H7l9 6",
  envelope: "M3 5h18v14H3zM3 6l9 7 9-7",
  copy: "M9 9h12v12H9zM15 9V3H3v12h6",
  check: "m5 12 4 4L19 6",
  portal: "m3 9 9-5 9 5H3Zm2 11h14M6 17v-5m6 5v-5m6 5v-5",
  grid: "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
};
function Icon({ name, size = 18 }: { name: keyof typeof icons; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={icons[name]} /></svg>;
}

const suggestions = ["Solar", "Agriculture", "Infrastructure", "Water supply", "Electrical", "Healthcare"];
const day = 86_400_000;
const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const dateLabel = (value: string | null) => value ? dateFormat.format(new Date(value)) : "—";
function storedInterests(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("tendor.interests") || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 10) : [];
  } catch { return []; }
}

function Dialog({ children, label, close, drawer = false }: { children: ReactNode; label: string; close: () => void; drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={drawer ? "drawer" : undefined} aria-label={label} onCancel={event => { event.preventDefault(); close(); }}>
    <button className="icon-button close" onClick={close} aria-label="Close"><Icon name="close" /></button>
    {children}
  </dialog>;
}

function InterestDialog({ initial, save, close }: { initial: string[]; save: (terms: string[]) => void; close: () => void }) {
  const [terms, setTerms] = useState(initial);
  const [custom, setCustom] = useState("");
  const trimmed = custom.trim();
  const exists = (term: string) => terms.some(item => item.toLowerCase() === term.toLowerCase());
  function add(event: FormEvent) {
    event.preventDefault();
    if (trimmed && !exists(trimmed) && terms.length < 10) setTerms([...terms, trimmed]);
    setCustom("");
  }
  return <Dialog label="Tender interests" close={close}>
    <div className="dialog-icon"><Icon name="tune" size={23} /></div>
    <h2>What tenders interest you?</h2>
    <p className="muted">Pick a few topics or add your own keywords to personalize your feed.</p>
    <div className="chips interests">
      {[...suggestions, ...terms.filter(term => !suggestions.some(item => item.toLowerCase() === term.toLowerCase()))].map(term =>
        <button key={term} className={exists(term) ? "chip active" : "chip"} aria-pressed={exists(term)} disabled={!exists(term) && terms.length >= 10} onClick={() => setTerms(exists(term) ? terms.filter(item => item.toLowerCase() !== term.toLowerCase()) : [...terms, term])}>{term}</button>)}
    </div>
    <form className="add-interest" onSubmit={add}>
      <input value={custom} onChange={event => setCustom(event.target.value)} placeholder="Add a keyword" aria-label="Custom keyword" maxLength={200} />
      <button className="secondary" disabled={!trimmed || exists(trimmed) || terms.length >= 10}><Icon name="plus" /> Add</button>
    </form>
    <button className="primary full" onClick={() => save(trimmed && !exists(trimmed) && terms.length < 10 ? [...terms, trimmed] : terms)}>Save interests <Icon name="arrow" /></button>
  </Dialog>;
}

function Facts({ rows }: { rows: [string, string | null][] }) {
  return <dl className="facts">{rows.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function Card({ tender, open }: { tender: Tender; open: () => void }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const source = tender.source || "mahatenders";

  async function copyTenderId() {
    try {
      await navigator.clipboard.writeText(tender.tender_id);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  const days = tender.bid_submission_end_at ? Math.ceil((Date.parse(tender.bid_submission_end_at) - Date.now()) / day) : null;
  const closed = tender.bid_submission_end_at !== null && Date.parse(tender.bid_submission_end_at) <= Date.now();
  return <article className="card">
    <div className="card-top"><div className="card-badges">
      <span className="category">{tender.tender_category || tender.tender_type || "Tender"}</span>
      <span className="category source-badge"><Icon name="portal" size={14} />{source === "mahatenders" ? "MahaTenders" : source}</span>
    </div>
      {days !== null && <span className={closed ? "deadline closed" : days <= 7 ? "deadline urgent" : "deadline"}><Icon name="clock" size={14} />{closed ? "Closed" : days === 1 ? "Closes within 1 day" : `${days} days left`}</span>}
    </div>
    <h3>{tender.title || tender.tender_id}</h3>
    <div className="card-meta">
      {tender.location && <span><Icon name="pin" size={16} />{tender.location}</span>}
      <span className="reference">{tender.tender_id}
        <button type="button" className="icon-button copy-id" title="Copy tender ID"
          aria-label={`Copy tender ID ${tender.tender_id}`} onClick={() => void copyTenderId()}>
          <Icon name={copyStatus === "copied" ? "check" : "copy"} size={15} />
        </button>
      </span>
      <span role="status">{copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Couldn’t copy the ID" : ""}</span>
    </div>
    <Facts rows={[
      ["Published", dateLabel(tender.published_at)], ["Bid submission closes", dateLabel(tender.bid_submission_end_at)],
      ["Tender value", tender.tender_value_inr ? currency.format(Number(tender.tender_value_inr)) : "—"],
      ["Tender type", tender.tender_type],
    ]} />
    <button className="primary full" onClick={open}>View tender information <Icon name="arrow" /></button>
    <div className="document-note"><Icon name="file" size={15} />{tender.files.length ? `${tender.files.length} document${tender.files.length === 1 ? "" : "s"} available` : "No documents available"}</div>
  </article>;
}

const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function documentUrl(value: string) {
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return apiBase + value;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function ChecklistItems({ items, pdf }: { items: ChecklistItem[]; pdf: string | null }) {
  return <ul className="checklist-items">{items.map((item, index) => {
    const source = `PDF page ${item.source.pdf_page}`;
    const fields: [keyof typeof icons, string, string | null][] = [
      ["requirement", "Requirement", item.status],
      ["rupee", "Amount", item.amount_inr ? `₹${item.amount_inr}` : null],
      ["arrow", "How to submit", item.submission_method],
      ["clock", "Deadline", item.deadline],
      ["file", "Condition", item.condition],
      ["envelope", "Envelope", item.envelope],
      ["layers", "Lot", item.lot_reference],
      ["grid", "Category", item.category.replaceAll("_", " ")],
    ];
    return <li key={index}>
      <div className="checklist-item-header">
        <label><input type="checkbox" /> <strong>{item.action}</strong></label>
        {pdf ? <a className="checklist-source" href={`${pdf.split("#")[0]}#page=${item.source.pdf_page}`} target="_blank" rel="noopener noreferrer"><Icon name="file" size={16} />{source}</a> : <span className="checklist-source">{source}</span>}
      </div>
      <dl className="checklist-meta">
        {fields.map(([icon, label, value]) => value && <div key={label}>
          <dt><Icon name={icon} size={16} />{label}</dt>
          <dd className={label === "Requirement" || label === "Category" ? "checklist-capitalized" : undefined}>{value}</dd>
        </div>)}
      </dl>
      {item.source.original_excerpt && <details><summary>Original wording</summary><p>{item.source.original_excerpt}</p></details>}
    </li>;
  })}</ul>;
}

function ChecklistResult({ data, pdf }: { data: Checklist; pdf: string | null }) {
  return <div className="checklist-result">
    <h4>Notice summary</h4><p>{data.other.summary}</p>
    <h4>Before submitting</h4>
    {data.checklist.length ? <ChecklistItems items={data.checklist} pdf={pdf} /> : <p>No requirements were extracted.</p>}
    {data.lots.length > 0 && <details>
      <summary>Lots and fees</summary>
      {data.lots.map((lot, index) => <div key={index}>
        <h4>{lot.reference}</h4>
        <ul>
          <li>{lot.title}</li>
          {lot.tender_fee_inr && <li><strong>Tender fee</strong> ₹{lot.tender_fee_inr}</li>}
          {lot.bid_security_amount_inr && <li><strong>Bid security</strong> ₹{lot.bid_security_amount_inr}</li>}
          {lot.bid_security_form && <li><strong>Bid security method</strong> {lot.bid_security_form}</li>}
        </ul>
      </div>)}
    </details>}
    {data.milestones.length > 0 && <details><summary>Key dates</summary><ul>{data.milestones.map((item, index) =>
      <li key={index}>{item.event}{item.date_time && ` · ${item.date_time}`}</li>)}</ul></details>}
    {data.post_award.length > 0 && <details><summary>After award</summary><ChecklistItems items={data.post_award} pdf={pdf} /></details>}
    {data.coverage.needs_review.length > 0 && <details open><summary>Needs review</summary><ul>{data.coverage.needs_review.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
    {data.coverage.referenced_documents.length > 0 && <details><summary>Referenced documents</summary><ul>{data.coverage.referenced_documents.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
    {data.other.additional_details.length > 0 && <details><summary>Additional details</summary><ul>{data.other.additional_details.map((item, index) => <li key={index}><strong>{item.label}</strong> · {item.value}</li>)}</ul></details>}
  </div>;
}

function PortalSearch({ refreshCatalog }: { refreshCatalog: () => void }) {
  const [keyword, setKeyword] = useState("");
  const [searching, setSearching] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const searchPending = useRef(false);

  function chooseKeyword(value: string) {
    setKeyword(value);
    setFeedback(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searchPending.current) return;

    const query = keyword.trim().replace(/\s+/g, " ");
    if (!query || Array.from(query).length < 4 || /\p{N}/u.test(query) || !/\p{L}/u.test(query)) {
      setFeedback({ message: "Enter a keyword with at least 4 characters, including a letter, and no numbers.", error: true });
      return;
    }

    searchPending.current = true;
    setSearching(true);
    setFeedback(null);
    try {
      const response = await fetch(`${apiBase}/api/v1/tender/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: query }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.downloaded_count !== "number") {
        throw new Error(typeof result?.detail === "string" ? result.detail : "The tender search could not be completed.");
      }
      const count = result.downloaded_count;
      setFeedback({
        message: count > 0
          ? `Downloaded ${count} tender ${count === 1 ? "package" : "packages"}. Refresh the catalog after processing finishes.`
          : "The portal search completed without downloading any tender packages.",
        error: false,
      });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "The tender search could not be completed.", error: true });
    } finally {
      searchPending.current = false;
      setSearching(false);
    }
  }

  return <details className="filters portal-search">
    <summary>Search Maharashtra tender portal</summary>
    <form onSubmit={submit}>
      <label htmlFor="portal-keyword">Tender keyword</label>
      <div className="portal-search-input">
        <input id="portal-keyword" value={keyword} onChange={event => chooseKeyword(event.target.value)}
          maxLength={200} placeholder="e.g. Solar street lighting" disabled={searching} />
        <button className="primary" disabled={searching}><Icon name="search" />{searching ? "Searching…" : "Search portal"}</button>
      </div>
      <div className="chips" aria-label="Suggested keywords">
        {suggestions.map(term => <button key={term} type="button" className="chip"
          disabled={searching} onClick={() => chooseKeyword(term)}>{term}</button>)}
      </div>
      {searching && <p role="status">Searching the portal and downloading tender packages…</p>}
      {feedback && <p role={feedback.error ? "alert" : "status"}>{feedback.message}</p>}
      {feedback && !feedback.error && <button className="secondary" type="button" onClick={refreshCatalog}>Refresh catalog</button>}
    </form>
  </details>;
}

function App() {
  const [interests, setInterests] = useState(storedInterests);
  const [editing, setEditing] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [dates, setDates] = useState({ from: "", to: "" });
  const [showDates, setShowDates] = useState(false);
  const [sort, setSort] = useState<Sort>("relevant");
  const [page, setPage] = useState(0);
  const [catalog, setCatalog] = useState<Catalog>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Tender | null>(null);
  const [checklists, setChecklists] = useState<Record<number, ChecklistState>>({});
  const [activeChecklist, setActiveChecklist] = useState<number | null>(null);
  const pendingChecklists = useRef(new Map<number, "observe" | "open" | "retry">());
  const checklistFile = selected?.files.find(file => file.id === activeChecklist);
  const checklistState = checklistFile ? checklists[checklistFile.id] : undefined;

  const loadChecklist = useCallback(async (fileId: number, intent: "observe" | "open" | "retry") => {
    if (pendingChecklists.current.has(fileId)) {
      if (intent !== "observe") pendingChecklists.current.set(fileId, intent);
      return;
    }
    pendingChecklists.current.set(fileId, intent);
    try {
      const url = `${apiBase}/api/v1/tenders/documents/${fileId}/checklist`;
      const getStatus = () => fetch(url, { cache: "no-store" });
      let response = await getStatus();
      let data = response.ok && response.status !== 202 ? await response.json() : null;
      const requested = pendingChecklists.current.get(fileId);
      if ((response.status === 404 && requested !== "observe") ||
          (data?.status === "failed" && requested === "retry")) {
        setChecklists(current => ({ ...current, [fileId]: { status: "loading" } }));
        response = await fetch(url, { method: "POST" });
        data = null;
      } else if (response.status === 404) {
        return;
      }
      if (response.status === 202) {
        setChecklists(current => ({ ...current, [fileId]: { status: "loading" } }));
        do {
          await response.body?.cancel();
          await new Promise(resolve => window.setTimeout(resolve, 3000));
          response = await getStatus();
        } while (response.status === 202);
      }
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(typeof error?.detail === "string" ? error.detail : "Could not load the checklist.");
      }
      const result: Checklist | { status: "failed"; error: string | null } = data ?? await response.json();
      if ("status" in result) throw new Error(result.error || "Checklist generation failed.");

      setChecklists(current => ({ ...current, [fileId]: { status: "ready", data: result } }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load the checklist.";
      setChecklists(current => ({ ...current, [fileId]: { status: "error", message } }));
    } finally {
      pendingChecklists.current.delete(fileId);
    }
  }, []);

  useEffect(() => {
    for (const file of selected?.files ?? []) {
      if (/\.pdf$/i.test(file.filename)) void loadChecklist(file.id, "observe");
    }
  }, [selected, loadChecklist]);

  function openChecklist(fileId: number, retry = false) {
    setActiveChecklist(fileId);
    if (checklists[fileId]?.status === "ready") return;
    if (!checklists[fileId]) {
      setChecklists(current => ({ ...current, [fileId]: { status: "loading" } }));
    }
    void loadChecklist(fileId, retry ? "retry" : "open");
  }

  const params = new URLSearchParams({ sort, limit: "12", offset: String(page * 12) });
  for (const term of topic ? [topic] : interests) params.append("keyword", term);
  if (search.trim()) params.set("q", search.trim());
  if (location.trim()) params.set("location", location.trim());
  if (dates.from) params.set("published_from", dates.from);
  if (dates.to) params.set("published_to", dates.to);
  const query = params.toString();
  const invalidDates = Boolean(dates.from && dates.to && dates.from > dates.to);

  useEffect(() => {
    const controller = new AbortController();
    if (invalidDates) return;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${apiBase}/api/v1/tenders?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error("The tender catalog is temporarily unavailable.");
        setCatalog(await response.json() as Catalog);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load tenders.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, revision, invalidDates]);

  function save(terms: string[]) {
    try { localStorage.setItem("tendor.interests", JSON.stringify(terms)); } catch { /* Keep interests for this session. */ }
    setInterests(terms);
    setTopic(null);
    setPage(0);
    setEditing(false);
  }

  return <>
    <header className="header"><div className="shell masthead">
      <a className="brand" href="./"><span className="brand-icon"><Icon name="layers" size={22} /></span>tendor<span className="brand-dot">.</span></a>
      <div className="header-right"><span className="nav-current"><Icon name="grid" size={16} /> Tender catalog</span>
      <button className="secondary" onClick={() => setEditing(true)}><Icon name="tune" /> My interests</button></div>
    </div></header>
    <main className="shell">
      <section className="hero">
        <div><h1>Explore tenders</h1><p>Browse Maharashtra tenders and find opportunities in your area of work.</p></div>
        {interests.length === 0 && <button className="primary" onClick={() => setEditing(true)}><Icon name="plus" /> Set your interests</button>}
      </section>
      <PortalSearch refreshCatalog={() => { setPage(0); setRevision(value => value + 1); }} />
      <section className="filters" aria-label="Tender filters">
        <div className="filter-row">
          <label className="input-wrap search"><Icon name="search" /><input value={search} maxLength={200} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Search tenders or reference ID" aria-label="Search tenders or reference ID" /></label>
          <label className="input-wrap location"><Icon name="pin" /><input value={location} maxLength={120} onChange={event => { setLocation(event.target.value); setPage(0); }} placeholder="Filter by location" aria-label="Filter by location" /></label>
          <button className="secondary date-button" aria-expanded={showDates} onClick={() => setShowDates(!showDates)}><Icon name="clock" /> Publication dates{(dates.from || dates.to) && <span className="filter-dot" />}</button>
        </div>
        {showDates && <div className="date-row">
          <label>Published from <input type="date" value={dates.from} onChange={event => { setDates({ ...dates, from: event.target.value }); setPage(0); }} /></label>
          <label>Published to <input type="date" value={dates.to} onChange={event => { setDates({ ...dates, to: event.target.value }); setPage(0); }} /></label>
          <button className="secondary" onClick={() => { setDates({ from: "", to: "" }); setPage(0); }}>Clear dates</button>
        </div>}
        {interests.length > 0 && <div className="chips topic-row"><button className={!topic ? "chip active" : "chip"} aria-pressed={!topic} onClick={() => { setTopic(null); setPage(0); }}>All interests</button>
          {interests.map(term => <button key={term} className={topic === term ? "chip active" : "chip"} aria-pressed={topic === term} onClick={() => { setTopic(term); setPage(0); }}>{term}</button>)}
          <button className="chip" onClick={() => setEditing(true)}><Icon name="plus" size={15} /> Edit interests</button>
        </div>}
      </section>
      <section className="results" aria-labelledby="results-title">
        <div className="results-bar"><div><h2 id="results-title">{interests.length ? "Matching tenders" : "Tender catalog"}</h2><p aria-live="polite">{loading ? "Loading catalog…" : error || invalidDates ? "" : `${catalog.total.toLocaleString("en-IN")} tender${catalog.total === 1 ? "" : "s"} found`}</p></div>
          <div className="sort" aria-label="Sort tenders">{([["relevant", "Relevant"], ["recent", "Recent"], ["closing", "Closing soon"]] as const).map(([key, label]) => <button key={key} aria-pressed={sort === key} onClick={() => { setSort(key); setPage(0); }}>{label}</button>)}</div>
        </div>
        {invalidDates ? <div className="empty" role="alert">Choose an end date on or after the start date.</div>
          : loading ? <div className="grid" aria-label="Loading tenders" aria-busy="true"><div className="skeleton" /><div className="skeleton" /></div>
          : error ? <div className="empty" role="alert"><Icon name="file" size={28} /><h3>Couldn’t load tenders</h3><p>{error}</p><button className="secondary" onClick={() => setRevision(value => value + 1)}>Try again</button></div>
          : !catalog.items.length ? <div className="empty"><Icon name="search" size={27} /><h3>No tenders found</h3><p>Try changing your search, dates, location, or interests.</p></div>
          : <><div className="grid">{catalog.items.map(tender => <Card key={tender.tender_id} tender={tender} open={() => { setSelected(tender); setActiveChecklist(null); }} />)}</div>
            {catalog.total > 12 && <nav className="pagination" aria-label="Catalog pages"><button className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {Math.ceil(catalog.total / 12)}</span><button className="secondary" disabled={(page + 1) * 12 >= catalog.total} onClick={() => setPage(page + 1)}>Next</button></nav>}</>}
      </section>
    </main>
    {editing && <InterestDialog initial={interests} save={save} close={() => setEditing(false)} />}
    {selected && <Dialog drawer label="Tender information" close={() => setSelected(null)}>
      <span className="category">{selected.tender_category || "Tender"}</span>
      <h2>{selected.title || selected.tender_id}</h2>
      <Facts rows={[["Reference", selected.tender_id], ["Organisation", selected.organisation_chain], ["Authority", selected.authority], ["Location", selected.location], ["Published", dateLabel(selected.published_at)], ["Closes", dateLabel(selected.bid_submission_end_at)]]} />
      <h3>Documents</h3>
      {selected.files.length === 0 && <p className="muted">No documents available for this tender.</p>}
      <ul className="files">{selected.files.map(file => {
        const url = documentUrl(file.url);
        const state = checklists[file.id];
        return <li key={file.id}><Icon name="file" />{url ? <a href={url} target="_blank" rel="noopener noreferrer">{file.filename}</a> : <span>{file.filename} (link unavailable)</span>}
          {/\.pdf$/i.test(file.filename) && <button className="secondary checklist-button" onClick={() => openChecklist(file.id, state?.status === "error")}>
            {state?.status === "loading" ? "Checklist processing" : state?.status === "error" ? "Retry checklist" : "View checklist"}
          </button>}
        </li>;
      })}</ul>
    </Dialog>}
    {checklistFile && checklistState && <Dialog drawer label="Tender checklist" close={() => setActiveChecklist(null)}>
      <h2>Tender checklist</h2>
      <p className="muted">{checklistFile.filename}</p>
      <section className="checklist-panel" aria-busy={checklistState.status === "loading"}>
        {checklistState.status === "loading" && <p role="status">Loading or preparing the checklist…</p>}
        {checklistState.status === "error" && <>
          <p role="alert">{checklistState.message}</p>
          <button className="secondary" onClick={() => openChecklist(checklistFile.id, true)}>Retry checklist</button>
        </>}
        {checklistState.status === "ready" && <ChecklistResult data={checklistState.data} pdf={documentUrl(checklistFile.url)} />}
      </section>
    </Dialog>}
  </>;
}

createRoot(document.getElementById("root")!).render(<App />);
