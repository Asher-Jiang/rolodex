import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, ArrowRight, BookUser, Check, ChevronRight, CircleUserRound,
  Database, FileUp, GitMerge, LoaderCircle, Mail, Menu, Phone, Plus, RefreshCw,
  Search, ShieldCheck, SlidersHorizontal, Sparkles, Users, X,
} from 'lucide-react';
import { api } from './api';
import type { Conflict, ContactMethod, Person, PersonListItem, SyncRun } from './types';

type Tab = 'people' | 'review' | 'settings';
type Filters = { companies: string[]; fields: string[]; affiliations: string[] };
type ToastKind = 'success' | 'error';
type Toast = { message: string; kind: ToastKind } | null;

const emptyPerson: Person = {
  fullName: '', preferredName: '', company: '', field: '', context: '', notes: '',
  contactMethods: [], affiliations: [], introducedBy: [], introducedTo: [],
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function relativeDate(value?: string | null) {
  if (!value) return 'Never';
  const date = new Date(value.endsWith('Z') ? value : `${value.replace(' ', 'T')}Z`);
  const days = Math.round((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

function App() {
  const [tab, setTab] = useState<Tab>('people');
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [filters, setFilters] = useState<Filters>({ companies: [], fields: [], affiliations: [] });
  const [query, setQuery] = useState('');
  const [company, setCompany] = useState('');
  const [field, setField] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [mobileNav, setMobileNav] = useState(false);

  const notify = useCallback((message: string, kind: ToastKind = 'success') => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const loadPeople = useCallback(async () => {
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    if (company) params.set('company', company);
    if (field) params.set('field', field);
    if (affiliation) params.set('affiliation', affiliation);
    try {
      setLoading(true);
      setPeople(await api.get<PersonListItem[]>(`/api/people?${params}`));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not load contacts.', 'error');
    } finally { setLoading(false); }
  }, [query, company, field, affiliation, notify]);

  useEffect(() => {
    const timer = window.setTimeout(loadPeople, 180);
    return () => window.clearTimeout(timer);
  }, [loadPeople]);

  useEffect(() => {
    api.get<Filters>('/api/people/filters').then(setFilters).catch(() => undefined);
  }, [people.length]);

  async function syncContacts() {
    try {
      setSyncing(true);
      const result = await api.send<{ total: number; created: number; matched: number; conflicts: number }>('/api/sync/apple', 'POST');
      notify(`Synced ${result.total} contacts — ${result.created} new, ${result.matched} matched, ${result.conflicts} to review.`);
      await loadPeople();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Contacts sync failed.', 'error');
    } finally { setSyncing(false); }
  }

  const activeFilters = [company, field, affiliation].filter(Boolean).length;
  const pageTitle = tab === 'people' ? 'People' : tab === 'review' ? 'Review queue' : 'Data & sync';

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark"><BookUser size={20} /></div><span>Rolodex</span></div>
        <nav>
          <NavButton active={tab === 'people'} icon={<Users size={19} />} label="People" onClick={() => { setTab('people'); setMobileNav(false); }} />
          <NavButton active={tab === 'review'} icon={<ShieldCheck size={19} />} label="Review queue" onClick={() => { setTab('review'); setMobileNav(false); }} />
          <NavButton active={tab === 'settings'} icon={<Database size={19} />} label="Data & sync" onClick={() => { setTab('settings'); setMobileNav(false); }} />
        </nav>
        <div className="sidebar-foot">
          <div className="local-pill"><span className="status-dot" /> Local only</div>
          <p>Your contacts stay on this Mac.</p>
        </div>
      </aside>
      {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close menu" />}

      <main>
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div><p className="eyebrow">Personal network</p><h1>{pageTitle}</h1></div>
          <div className="top-actions">
            <button className="button secondary sync-button" onClick={syncContacts} disabled={syncing}>
              {syncing ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}<span>{syncing ? 'Syncing…' : 'Sync Contacts'}</span>
            </button>
            {tab === 'people' && <button className="button primary" onClick={() => setCreating(true)}><Plus size={18} /> Add person</button>}
          </div>
        </header>

        {tab === 'people' && <section className="page-content">
          <div className="search-row">
            <label className="search-box"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, companies, notes, introductions…" />{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={16} /></button>}</label>
            <div className="filter-label"><SlidersHorizontal size={17} /> Filters {activeFilters > 0 && <span>{activeFilters}</span>}</div>
          </div>
          <div className="filters-row">
            <FilterSelect label="All companies" value={company} options={filters.companies} onChange={setCompany} />
            <FilterSelect label="All fields" value={field} options={filters.fields} onChange={setField} />
            <FilterSelect label="All affiliations" value={affiliation} options={filters.affiliations} onChange={setAffiliation} />
            {activeFilters > 0 && <button className="clear-filters" onClick={() => { setCompany(''); setField(''); setAffiliation(''); }}>Clear all</button>}
          </div>

          <div className="table-card">
            <div className="table-meta"><span>{people.length} {people.length === 1 ? 'person' : 'people'}</span><span>Sorted by recently updated</span></div>
            {loading ? <LoadingState /> : people.length === 0 ? <EmptyState query={query} onAdd={() => setCreating(true)} /> : <PeopleTable people={people} onSelect={setSelectedId} />}
          </div>
        </section>}
        {tab === 'review' && <ReviewQueue notify={notify} onOpenPerson={setSelectedId} />}
        {tab === 'settings' && <DataSync notify={notify} onImported={loadPeople} onSync={syncContacts} syncing={syncing} />}
      </main>

      {(selectedId || creating) && <PersonDrawer personId={selectedId} creating={creating} onClose={() => { setSelectedId(null); setCreating(false); }} onSaved={async (message) => { notify(message); setSelectedId(null); setCreating(false); await loadPeople(); }} />}
      {toast && <div className={`toast ${toast.kind}`} role="status">{toast.kind === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}<span>{toast.message}</span><button onClick={() => setToast(null)}><X size={15} /></button></div>}
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}>{icon}<span>{label}</span>{active && <ChevronRight size={16} />}</button>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}><option value="">{label}</option>{options.map((option) => <option key={option}>{option}</option>)}</select>;
}

function PeopleTable({ people, onSelect }: { people: PersonListItem[]; onSelect: (id: number) => void }) {
  return <div className="table-scroll"><table>
    <thead><tr><th>Name</th><th>Company & field</th><th>Contact</th><th>Affiliations</th><th>Introduced by</th><th>Notes</th><th aria-label="Open" /></tr></thead>
    <tbody>{people.map((person) => <tr key={person.id} onClick={() => onSelect(person.id)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onSelect(person.id)}>
      <td><div className="person-cell"><span className="avatar">{initials(person.fullName)}</span><div><strong>{person.fullName}</strong>{person.preferredName && <small>Goes by {person.preferredName}</small>}</div></div></td>
      <td><strong className="medium">{person.company || '—'}</strong><small>{person.field || ''}</small></td>
      <td className="truncate-cell">{person.contactSummary || '—'}</td>
      <td><TagList value={person.affiliations} /></td>
      <td>{person.introducedBy || '—'}</td>
      <td className="notes-preview">{person.notes || '—'}</td>
      <td><ChevronRight size={17} className="row-arrow" /></td>
    </tr>)}</tbody>
  </table></div>;
}

function TagList({ value }: { value: string | null }) {
  if (!value) return <>—</>;
  const tags = value.split(', ');
  return <div className="tag-list"><span className="tag">{tags[0]}</span>{tags.length > 1 && <span className="tag more">+{tags.length - 1}</span>}</div>;
}

function LoadingState() { return <div className="state-block"><LoaderCircle className="spin" size={25} /><p>Loading your network…</p></div>; }
function EmptyState({ query, onAdd }: { query: string; onAdd: () => void }) { return <div className="state-block"><div className="empty-icon"><Search size={24} /></div><h3>{query ? 'No matching people' : 'Your rolodex is ready'}</h3><p>{query ? 'Try a broader search or clear your filters.' : 'Add someone manually or import your existing contacts.'}</p>{!query && <button className="button primary" onClick={onAdd}><Plus size={17} /> Add person</button>}</div>; }

function PersonDrawer({ personId, creating, onClose, onSaved }: { personId: number | null; creating: boolean; onClose: () => void; onSaved: (message: string) => void }) {
  const [person, setPerson] = useState<Person>(emptyPerson);
  const [loading, setLoading] = useState(!creating);
  const [editing, setEditing] = useState(creating);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [affiliationsText, setAffiliationsText] = useState('');
  const [introducedToText, setIntroducedToText] = useState('');
  const [introducedByText, setIntroducedByText] = useState('');

  const applyPerson = useCallback((data: Person) => {
    setPerson(data);
    setAffiliationsText(data.affiliations.map((item) => item.name).join(', '));
    setIntroducedToText(data.introducedTo.map((item) => item.fullName).join(', '));
    setIntroducedByText(data.introducedBy.map((item) => item.fullName).join(', '));
  }, []);

  useEffect(() => {
    if (!personId) return;
    api.get<Person>(`/api/people/${personId}`).then(applyPerson).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [personId, applyPerson]);

  useEffect(() => {
    if (!personId || editing) return;
    const refresh = () => api.get<Person>(`/api/people/${personId}`).then(applyPerson).catch(() => undefined);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [personId, editing, applyPerson]);

  function update(field: keyof Person, value: string) { setPerson((current) => ({ ...current, [field]: value })); }
  function updateMethod(index: number, patch: Partial<ContactMethod>) { setPerson((current) => ({ ...current, contactMethods: current.contactMethods.map((method, i) => i === index ? { ...method, ...patch } : method) })); }
  function removeMethod(index: number) { setPerson((current) => ({ ...current, contactMethods: current.contactMethods.filter((_, i) => i !== index) })); }

  async function save() {
    if (!person.fullName.trim()) return setError('Name is required.');
    setSaving(true); setError('');
    const body = {
      ...person,
      affiliations: affiliationsText.split(',').map((item) => item.trim()).filter(Boolean),
      introducedToNames: introducedToText.split(',').map((item) => item.trim()).filter(Boolean),
      introducedByNames: introducedByText.split(',').map((item) => item.trim()).filter(Boolean),
    };
    try {
      if (creating) await api.send<Person>('/api/people', 'POST', body);
      else await api.send<Person>(`/api/people/${personId}`, 'PUT', body);
      onSaved(creating ? `${person.fullName} was added.` : `${person.fullName} was updated.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save.'); }
    finally { setSaving(false); }
  }

  return <><button className="drawer-scrim" onClick={onClose} aria-label="Close details" /><aside className="drawer">
    <div className="drawer-top"><div><p className="eyebrow">{creating ? 'New contact' : 'Contact details'}</p><h2>{creating ? 'Add a person' : person.fullName || 'Person'}</h2></div><button className="icon-button" onClick={onClose}><X size={21} /></button></div>
    {loading ? <LoadingState /> : <div className="drawer-body">
      {!editing && <div className="profile-hero"><span className="avatar large">{initials(person.fullName)}</span><div><h3>{person.fullName}</h3><p>{person.field && person.company ? `${person.field} at ${person.company}` : person.field || person.company || 'No company added'}</p></div><button className="button secondary" onClick={() => setEditing(true)}>Edit</button></div>}
      {error && <div className="inline-error"><AlertCircle size={17} />{error}</div>}
      {editing ? <PersonForm person={person} update={update} affiliationsText={affiliationsText} setAffiliationsText={setAffiliationsText} introducedToText={introducedToText} setIntroducedToText={setIntroducedToText} introducedByText={introducedByText} setIntroducedByText={setIntroducedByText} updateMethod={updateMethod} removeMethod={removeMethod} addMethod={() => setPerson((current) => ({ ...current, contactMethods: [...current.contactMethods, { type: 'email', value: '', source: 'manual' }] }))} /> : <PersonDetails person={person} />}
    </div>}
    {editing && !loading && <div className="drawer-actions"><button className="button secondary" onClick={creating ? onClose : () => setEditing(false)}>Cancel</button><button className="button primary" onClick={save} disabled={saving}>{saving && <LoaderCircle size={17} className="spin" />}{saving ? 'Saving…' : 'Save person'}</button></div>}
  </aside></>;
}

function PersonForm({ person, update, affiliationsText, setAffiliationsText, introducedToText, setIntroducedToText, introducedByText, setIntroducedByText, updateMethod, removeMethod, addMethod }: {
  person: Person; update: (field: keyof Person, value: string) => void; affiliationsText: string; setAffiliationsText: (value: string) => void;
  introducedToText: string; setIntroducedToText: (value: string) => void; introducedByText: string; setIntroducedByText: (value: string) => void;
  updateMethod: (index: number, patch: Partial<ContactMethod>) => void; removeMethod: (index: number) => void; addMethod: () => void;
}) {
  return <div className="form-stack">
    <div className="field-grid"><Field label="Full name" required value={person.fullName} onChange={(v) => update('fullName', v)} /><Field label="Preferred name" value={person.preferredName || ''} onChange={(v) => update('preferredName', v)} /></div>
    <div className="field-grid"><Field label="Company" value={person.company || ''} onChange={(v) => update('company', v)} /><Field label="Field / role" value={person.field || ''} onChange={(v) => update('field', v)} placeholder="VC, robotics, quant…" /></div>
    <Field label="Affiliations" value={affiliationsText} onChange={setAffiliationsText} placeholder="UChicago, SPC, Jane Street" hint="Separate affiliations with commas." />
    <div className="field-grid"><Field label="Introduced me to" value={introducedToText} onChange={setIntroducedToText} placeholder="Person names" hint="Separate names with commas." /><Field label="Introduced by" value={introducedByText} onChange={setIntroducedByText} placeholder="Person names" hint="Separate names with commas." /></div>
    <div className="section-heading"><div><h4>Contact methods</h4><p>Email, phone, LinkedIn, or anything else.</p></div><button className="text-button" onClick={addMethod}><Plus size={15} /> Add</button></div>
    {person.contactMethods.length === 0 && <p className="muted-box">No contact methods yet.</p>}
    {person.contactMethods.map((method, index) => <div className="contact-edit" key={`${method.id || 'new'}-${index}`}><select value={method.type} onChange={(e) => updateMethod(index, { type: e.target.value })}><option value="email">Email</option><option value="phone">Phone</option><option value="linkedin">LinkedIn</option><option value="twitter">Twitter / X</option><option value="messenger">Messenger</option><option value="imessage">iMessage</option><option value="other">Other</option></select><input value={method.value} onChange={(e) => updateMethod(index, { value: e.target.value })} placeholder="Value" /><button className="icon-button danger" onClick={() => removeMethod(index)}><X size={17} /></button></div>)}
    <TextArea label="How we met" value={person.context || ''} onChange={(v) => update('context', v)} placeholder="Class, event, internship, introduction…" />
    <TextArea label="Notes" value={person.notes || ''} onChange={(v) => update('notes', v)} placeholder="Conversation notes, follow-ups, useful context…" rows={6} />
  </div>;
}

function Field({ label, value, onChange, placeholder, required, hint }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; hint?: string }) {
  return <label className="form-field"><span>{label}{required && <em>*</em>}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />{hint && <small>{hint}</small>}</label>;
}
function TextArea({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; rows?: number }) {
  return <label className="form-field"><span>{label}</span><textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function PersonDetails({ person }: { person: Person }) {
  return <div className="details-stack">
    <DetailSection title="About"><DetailRow label="Company" value={person.company} /><DetailRow label="Field / role" value={person.field} /></DetailSection>
    <DetailSection title="How we met"><p className={person.context ? 'meeting-context' : 'muted'}>{person.context || 'No meeting context yet.'}</p></DetailSection>
    <DetailSection title="Contact">
      {person.contactMethods.length ? person.contactMethods.map((method) => <div className="contact-line" key={`${method.type}-${method.value}`}>{method.type === 'email' ? <Mail size={17} /> : method.type === 'phone' ? <Phone size={17} /> : <CircleUserRound size={17} />}<div><span>{method.type}</span><strong>{method.value}</strong>{method.label && <small>{method.label}</small>}</div></div>) : <p className="muted">No contact methods.</p>}
    </DetailSection>
    <DetailSection title="Affiliations"><div className="tag-list wrap">{person.affiliations.length ? person.affiliations.map((item) => <span className="tag" key={item.id}>{item.name}</span>) : <span className="muted">None added.</span>}</div></DetailSection>
    <DetailSection title="Introductions">
      <RelationList label="Introduced me to" people={person.introducedTo} />
      <RelationList label="Introduced by" people={person.introducedBy} />
    </DetailSection>
    <DetailSection title="Notes"><p className="long-copy">{person.notes || 'No notes yet.'}</p></DetailSection>
    <div className="source-strip"><Database size={16} /><div><span>Source</span><strong>{(person.source || 'manual').replaceAll('_', ' ')}</strong></div><div><span>Last updated</span><strong>{relativeDate(person.updatedAt)}</strong></div>{person.lastSyncedFromContactsAt && <div><span>Contacts sync</span><strong>{relativeDate(person.lastSyncedFromContactsAt)}</strong></div>}</div>
    {person.rawSourceData != null && <details className="raw-source"><summary>View preserved source data</summary><pre>{JSON.stringify(person.rawSourceData, null, 2)}</pre></details>}
  </div>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="detail-section"><h4>{title}</h4>{children}</section>; }
function DetailRow({ label, value }: { label: string; value?: string | null }) { return <div className="detail-row"><span>{label}</span><strong>{value || '—'}</strong></div>; }
function RelationList({ label, people }: { label: string; people: Array<{ id: number; fullName: string }> }) { return <div className="relation-list"><span>{label}</span>{people.length ? people.map((person) => <strong key={person.id}><span className="mini-avatar">{initials(person.fullName)}</span>{person.fullName}</strong>) : <em>None recorded</em>}</div>; }

function ReviewQueue({ notify, onOpenPerson }: { notify: (message: string, kind?: ToastKind) => void; onOpenPerson: (id: number) => void }) {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => api.get<Conflict[]>('/api/conflicts').then(setConflicts).catch((error) => notify(error.message, 'error')).finally(() => setLoading(false)), [notify]);
  useEffect(() => { load(); }, [load]);
  async function resolve(id: number, action: string) {
    try { await api.send(`/api/conflicts/${id}/resolve`, 'POST', { action }); notify('Review item resolved.'); await load(); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not resolve item.', 'error'); }
  }
  return <section className="page-content narrow-page">
    <div className="intro-card"><div className="intro-icon"><ShieldCheck size={24} /></div><div><h2>Nothing gets guessed</h2><p>Potential duplicates and conflicting details wait here until you choose what is right.</p></div><span className="count-badge">{conflicts.length} pending</span></div>
    {loading ? <LoadingState /> : conflicts.length === 0 ? <div className="review-empty"><div><Sparkles size={28} /></div><h3>All clear</h3><p>No contacts need your attention right now.</p></div> : <div className="conflict-list">{conflicts.map((conflict) => <article className="conflict-card" key={conflict.id}>
      <div className="conflict-head"><span className={`source-badge ${conflict.source}`}>{conflict.source === 'notion' ? 'Notion import' : 'Apple Contacts'}</span><small>{relativeDate(conflict.createdAt)}</small></div>
      {conflict.conflictType === 'possible_duplicate' ? <>
        <h3>Are these the same person?</h3>
        <div className="duplicate-compare"><button onClick={() => conflict.incomingPersonId && onOpenPerson(conflict.incomingPersonId)}><span className="avatar">{initials(conflict.incomingName)}</span><div><small>Incoming contact</small><strong>{conflict.incomingPersonName || conflict.incomingName}</strong></div></button><GitMerge size={19} /><button onClick={() => conflict.possiblePersonId && onOpenPerson(conflict.possiblePersonId)}><span className="avatar alt">{initials(conflict.possiblePersonName || '')}</span><div><small>Possible match</small><strong>{conflict.possiblePersonName}</strong></div></button></div>
        <div className="card-actions"><button className="button primary" onClick={() => resolve(conflict.id, 'merge')}><GitMerge size={16} /> Merge people</button><button className="button secondary" onClick={() => resolve(conflict.id, 'keep_separate')}>Keep separate</button></div>
      </> : <>
        <h3>Choose the {conflict.field}</h3><p className="conflict-person">For <strong>{conflict.possiblePersonName || conflict.incomingName}</strong></p>
        <div className="value-compare"><button onClick={() => resolve(conflict.id, 'keep_existing')}><small>Keep in Rolodex</small><strong>{conflict.existingValue || 'Empty'}</strong></button><ArrowRight size={18} /><button onClick={() => resolve(conflict.id, 'accept_incoming')}><small>Use incoming</small><strong>{conflict.incomingValue || 'Empty'}</strong></button></div>
        <div className="card-actions"><button className="text-button muted" onClick={() => resolve(conflict.id, 'ignore')}>Ignore this conflict</button></div>
      </>}
    </article>)}</div>}
  </section>;
}

function DataSync({ notify, onImported, onSync, syncing }: { notify: (message: string, kind?: ToastKind) => void; onImported: () => void; onSync: () => void; syncing: boolean }) {
  const [files, setFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const loadRuns = useCallback(() => api.get<SyncRun[]>('/api/sync-runs').then(setRuns).catch(() => undefined), []);
  useEffect(() => { loadRuns(); }, [loadRuns]);
  async function importFiles() {
    if (!files.length) return;
    const data = new FormData(); files.forEach((file) => data.append('files', file));
    try {
      setImporting(true);
      const result = await api.upload<{ rows: number; created: number; updated: number; introductions: number }>('/api/import/notion', data);
      notify(`Imported ${result.rows} rows — ${result.created} people created and ${result.introductions} introductions linked.`);
      setFiles([]); onImported(); loadRuns();
    } catch (error) { notify(error instanceof Error ? error.message : 'Import failed.', 'error'); }
    finally { setImporting(false); }
  }
  return <section className="page-content narrow-page">
    <div className="data-grid">
      <article className="data-card"><div className="data-card-icon apple"><CircleUserRound size={23} /></div><div className="data-card-copy"><h2>Apple Contacts</h2><p>Bring in every contact on this Mac. Email and phone are synced safely; your Rolodex notes are never overwritten.</p><div className="policy-row"><Check size={15} /> Matches by email, phone, and name</div><div className="policy-row"><Check size={15} /> Uncertain matches go to review</div></div><button className="button primary" onClick={onSync} disabled={syncing}>{syncing ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}{syncing ? 'Syncing…' : 'Sync now'}</button></article>
      <article className="data-card"><div className="data-card-icon notion"><FileUp size={23} /></div><div className="data-card-copy"><h2>Notion CSV</h2><p>One-time migration from your old database. You can select multiple exports; matching people are merged without dropping raw rows.</p><label className="file-picker"><input type="file" accept=".csv,text/csv" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /><FileUp size={17} />{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'Choose CSV files'}</label>{files.length > 0 && <div className="file-list">{files.map((file) => <span key={file.name}>{file.name}</span>)}</div>}</div><button className="button secondary" onClick={importFiles} disabled={!files.length || importing}>{importing && <LoaderCircle className="spin" size={17} />}{importing ? 'Importing…' : 'Import files'}</button></article>
    </div>
    <div className="history-card"><div className="history-head"><div><p className="eyebrow">Activity</p><h2>Recent data runs</h2></div><RefreshCw size={18} /></div>{runs.length === 0 ? <p className="muted">No imports or syncs yet.</p> : <div className="run-list">{runs.map((run) => {
      let summary: Record<string, number> = {}; try { summary = run.summary ? JSON.parse(run.summary) : {}; } catch { /* leave empty */ }
      return <div className="run-row" key={run.id}><span className={`run-icon ${run.source}`} >{run.source === 'notion' ? <FileUp size={17} /> : <RefreshCw size={17} />}</span><div><strong>{run.source === 'notion' ? 'Notion import' : 'Apple Contacts sync'}</strong><small>{relativeDate(run.startedAt)} · {summary.rows ? `${summary.rows} rows` : summary.total ? `${summary.total} contacts` : run.status}</small></div><span className={`run-status ${run.status}`}><Check size={13} />{run.status}</span></div>;
    })}</div>}</div>
  </section>;
}

export default App;
