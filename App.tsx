import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { LocalSession } from './lib/localStore';
import {
  Activity, ArrowDownToLine, ArrowRight, BadgeIndianRupee, Boxes, Check, ChevronDown,
  CircleHelp, ClipboardList, FilePlus2, FileText, Filter, LayoutDashboard, LogOut,
  Menu, Plus, Search, Settings2, ShoppingBag, Store, Trash2, Truck, Users, X,
} from 'lucide-react';
import AuthScreen from './components/AuthScreen';
import DocumentEditor from './components/DocumentEditor';
import { displayDate, errorMessage, money, normalisePhone } from './lib/format';
import { downloadDocumentPdf } from './lib/pdf';
import { localStore } from './lib/localStore';
import type { BillingDocument, Customer, DocumentType, Product, ShopProfile } from './types';
import './index.css';

type View = 'dashboard' | 'create-bill' | 'create-challan' | 'items' | 'history' | 'customers' | 'settings';
const navItems: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'create-bill', label: 'Create bill', icon: FilePlus2 },
  { id: 'create-challan', label: 'Create challan', icon: Truck },
  { id: 'items', label: 'Add items', icon: Boxes },
  { id: 'history', label: 'Bills history', icon: ClipboardList },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'settings', label: 'Shop settings', icon: Settings2 },
];

const emptyProfile = (userId: string): ShopProfile => ({ user_id: userId, owner_name: '', shop_name: '', address: '', phone: '', logo_url: '' });


export default function App() {
  const [session, setSession] = useState<LocalSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [view, setView] = useState<View>('dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [documents, setDocuments] = useState<BillingDocument[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingDocument, setEditingDocument] = useState<BillingDocument | null>(null);
  const [pendingCustomerId, setPendingCustomerId] = useState<string>('');
  const [previewDocument, setPreviewDocument] = useState<BillingDocument | null>(null);

  useEffect(() => {
    localStore.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false); });
    const { data } = localStore.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setSession(nextSession);
      if (!nextSession) { setProfile(null); setProducts([]); setCustomers([]); setDocuments([]); }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const loadData = useCallback(async () => {
    if (!session?.user) return;
    setLoadingData(true); setLoadError('');
    try {
      const user = session.user;
      const [profileResult, productResult, customerResult, documentResult] = await Promise.all([
        localStore.from('shop_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        localStore.from('products').select('*').order('name'),
        localStore.from('customers').select('*').order('name'),
        localStore.from('documents').select('*, items:document_items(*)').order('created_at', { ascending: false }).limit(500),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (productResult.error) throw productResult.error;
      if (customerResult.error) throw customerResult.error;
      if (documentResult.error) throw documentResult.error;
      let fetchedProfile = profileResult.data as ShopProfile | null;
      if (!fetchedProfile) {
        const { data: createdProfile, error: profileError } = await localStore.from('shop_profiles').upsert({
          ...emptyProfile(user.id), owner_name: String(user.user_metadata?.owner_name || ''), shop_name: String(user.user_metadata?.shop_name || ''),
        }).select('*').single();
        if (profileError) throw profileError;
        fetchedProfile = createdProfile as ShopProfile;
      }
      setProfile(fetchedProfile);
      setProducts((productResult.data || []) as Product[]);
      setCustomers((customerResult.data || []) as Customer[]);
      setDocuments((documentResult.data || []) as BillingDocument[]);
    } catch (err) { setLoadError(errorMessage(err)); }
    finally { setLoadingData(false); }
  }, [session]);

  useEffect(() => { if (session) void loadData(); }, [session, loadData]);

  if (authLoading) return <div className="loading-screen"><span className="spinner spinner-dark" /><span>Loading your workspace…</span></div>;
  if (passwordRecovery && session) return <NewPasswordScreen onDone={() => setPasswordRecovery(false)} />;
  if (!session) return <AuthScreen />;

  const navigate = (next: View) => { setView(next); setMobileNav(false); setEditingDocument(null); setPendingCustomerId(''); setNotice(''); };
  const startDocument = (type: DocumentType) => { setEditingDocument(null); setPendingCustomerId(''); setView(type === 'bill' ? 'create-bill' : 'create-challan'); setNotice(''); };
  const startCustomerBill = (customer: Customer) => { setEditingDocument(null); setView('create-bill'); setNotice(''); setPendingCustomerId(customer.id); };
  const editDraft = (doc: BillingDocument) => {
    if (doc.status !== 'draft') return;
    setPreviewDocument(null); setEditingDocument(doc); setPendingCustomerId('');
    setView(doc.document_type === 'bill' ? 'create-bill' : 'create-challan'); setNotice('');
  };
  const onDocumentSaved = async (id: string, status: 'draft' | 'finalized') => {
    setNotice(status === 'finalized' ? 'Document finalized successfully.' : 'Draft saved successfully.');
    setEditingDocument(null); setView('history'); await loadData();
    const { data } = await localStore.from('documents').select('*, items:document_items(*)').eq('id', id).maybeSingle();
    if (data && status === 'finalized') setPreviewDocument(data as BillingDocument);
  };
  const signOut = async () => { await localStore.auth.signOut(); setView('dashboard'); };

  return <div className="app-frame">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><span className="brand-mark"><ReceiptTextFallback /></span><span className="brand-word">ledger<span className="brand-dot">.</span></span><button className="icon-button close-nav" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="shop-chip"><div className="shop-avatar">{(profile?.shop_name || 'S').slice(0, 1).toUpperCase()}</div><div className="shop-chip-copy"><strong>{profile?.shop_name || 'Your shop'}</strong><span>Shop workspace</span></div><ChevronDown size={15} className="muted" /></div>
      <span className="nav-section-label">WORKSPACE</span>
      <nav className="side-nav">{navItems.map(item => { const Icon = item.icon; return <button key={item.id} className={`nav-link ${view === item.id || ((view === 'create-bill' || view === 'create-challan') && item.id === view) ? 'active' : ''}`} onClick={() => navigate(item.id)}><Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{item.id === 'items' && products.length > 0 && <span className="nav-count">{products.length}</span>}</button>; })}</nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><CircleHelp size={17} /><div><strong>Need a hand?</strong><span>Read the setup guide in README.</span></div></div><button className="profile-mini" onClick={() => navigate('settings')}><div className="profile-avatar">{(profile?.owner_name || session.user.email || 'U').slice(0, 1).toUpperCase()}</div><div className="profile-mini-copy"><strong>{profile?.owner_name || 'Shop owner'}</strong><span>{session.user.email}</span></div><Settings2 size={16} /></button><button className="nav-link logout-link" onClick={signOut}><LogOut size={18} /><span>Log out</span></button></div>
    </aside>
    {mobileNav && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <main className="main-area">
      <header className="topbar"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{navItems.find(i => i.id === view)?.label || 'Create document'}</strong></div><div className="topbar-right"><span className="date-pill"><Activity size={14} /> {new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date())}</span><button className="top-avatar" onClick={() => navigate('settings')} title="Shop settings">{(profile?.owner_name || 'U').slice(0, 1).toUpperCase()}</button></div></header>
      <div className="content-area">
        {loadError && <div className="alert alert-error global-alert"><span>{loadError}</span><button className="text-button" onClick={() => void loadData()}>Try again</button></div>}
        {notice && <div className="alert alert-success global-alert"><Check size={16} /><span>{notice}</span><button className="icon-button" onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={16} /></button></div>}
        {loadingData && !profile && <div className="loading-inline"><span className="spinner spinner-dark" /> Preparing your workspace…</div>}
        {view === 'dashboard' && <Dashboard profile={profile} products={products} customers={customers} documents={documents} onNavigate={navigate} onCreate={startDocument} onOpenDocument={setPreviewDocument} />}
        {(view === 'create-bill' || view === 'create-challan') && profile && <DocumentEditor key={`${view}-${editingDocument?.id || pendingCustomerId || 'new'}`} type={view === 'create-bill' ? 'bill' : 'challan'} products={products} customers={customers} initial={editingDocument} initialCustomerId={pendingCustomerId} onCancel={() => navigate('dashboard')} onSaved={(id, status) => { setPendingCustomerId(''); return onDocumentSaved(id, status); }} />}
        {view === 'items' && <ProductsPage products={products} reload={loadData} />}
        {view === 'customers' && <CustomersPage customers={customers} documents={documents} reload={loadData} onCreateBill={startCustomerBill} onOpenDocument={setPreviewDocument} />}
        {view === 'history' && <HistoryPage documents={documents} profile={profile} onPreview={setPreviewDocument} onEditDraft={editDraft} onReload={loadData} />}
        {view === 'settings' && profile && <SettingsPage profile={profile} onSaved={async () => { await loadData(); setNotice('Shop details updated.'); }} />}
      </div>
    </main>
    {previewDocument && <DocumentPreview document={previewDocument} profile={profile} onClose={() => setPreviewDocument(null)} onEdit={editDraft} />}
  </div>;
}


function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setSuccess('');
    if (password.length < 8) { setError('Use a password with at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    
    setBusy(true);
    try { const { error: updateError } = await localStore.auth.updateUser({ password }); if (updateError) throw updateError; setSuccess('Password updated. Opening your workspace…'); window.setTimeout(onDone, 700); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <main className="reset-page"><form className="panel reset-card" onSubmit={submit}><span className="brand-mark reset-brand"><FileText size={20} /></span><span className="eyebrow">ACCOUNT SECURITY</span><h1>Choose a new password</h1><p>Set a password for your Ledger account. Use at least 8 characters.</p><label>New password<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required /></label><label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} required /></label>{error && <div className="alert alert-error">{error}</div>}{success && <div className="alert alert-success">{success}</div>}<button className="button button-primary button-full" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button><button type="button" className="button button-ghost button-full" onClick={onDone}>Cancel</button></form></main>;
}

function ReceiptTextFallback() { return <FileText size={19} strokeWidth={2.1} />; }

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action && <div className="page-heading-action">{action}</div>}</div>;
}

function Dashboard({ profile, products, customers, documents, onNavigate, onCreate, onOpenDocument }: {
  profile: ShopProfile | null; products: Product[]; customers: Customer[]; documents: BillingDocument[];
  onNavigate: (view: View) => void; onCreate: (type: DocumentType) => void; onOpenDocument: (doc: BillingDocument) => void;
}) {
  const [search, setSearch] = useState('');
  const recent = useMemo(() => documents.filter(d => !search || d.document_number.toLowerCase().includes(search.toLowerCase()) || (d.customer_snapshot?.name || '').toLowerCase().includes(search.toLowerCase())).slice(0, 6), [documents, search]);
  const finalBills = documents.filter(d => d.status === 'finalized' && d.document_type === 'bill');
  const totalSales = finalBills.reduce((sum, d) => sum + Number(d.total), 0);
  const drafts = documents.filter(d => d.status === 'draft').length;
  return <section className="page-section">
    <PageHeader eyebrow="YOUR BUSINESS AT A GLANCE" title={`Good day${profile?.owner_name ? `, ${profile.owner_name.split(' ')[0]}` : ''}.`} description={`${profile?.shop_name || 'Your shop'} — here’s what’s happening in your workspace.`} action={<button className="button button-primary" onClick={() => onCreate('bill')}><Plus size={17} /> Create a bill</button>} />
    <div className="quick-actions"><button className="quick-action-card" onClick={() => onCreate('bill')}><span className="quick-icon black"><FileText size={20} /></span><span><strong>Create bill</strong><small>Generate an invoice for a sale</small></span><ArrowRight size={17} className="quick-arrow" /></button><button className="quick-action-card" onClick={() => onCreate('challan')}><span className="quick-icon"><Truck size={20} /></span><span><strong>Create challan</strong><small>Record items delivered or sent</small></span><ArrowRight size={17} className="quick-arrow" /></button><button className="quick-action-card" onClick={() => onNavigate('items')}><span className="quick-icon"><Boxes size={20} /></span><span><strong>Add items</strong><small>Manage your product catalogue</small></span><ArrowRight size={17} className="quick-arrow" /></button></div>
    <div className="stats-grid"><StatCard label="Finalized bills" value={String(finalBills.length)} foot="All-time invoice count" icon={<FileText size={17} />} /><StatCard label="Bill value" value={money(totalSales)} foot="Finalized bills only" icon={<BadgeIndianRupee size={17} />} /><StatCard label="Products" value={String(products.length)} foot="Saved in your catalogue" icon={<Boxes size={17} />} /><StatCard label="Customers" value={String(customers.length)} foot={drafts ? `${drafts} draft${drafts === 1 ? '' : 's'} to finish` : 'Customer directory'} icon={<Users size={17} />} /></div>
    <section className="panel recent-panel"><div className="panel-heading"><div><h2>Recent documents</h2><p>Your latest bills and challans.</p></div><button className="button button-secondary button-small" onClick={() => onNavigate('history')}>View history <ArrowRight size={15} /></button></div>
      <div className="table-toolbar"><div className="search-wrap"><Search size={16} /><input placeholder="Search number or customer…" value={search} onChange={e => setSearch(e.target.value)} /></div><span className="muted small">{recent.length} shown</span></div>
      <DocumentTable documents={recent} onPreview={onOpenDocument} emptyTitle={search ? 'No matching documents' : 'No documents yet'} emptyText={search ? 'Try a different search term.' : 'Create your first bill or challan to see it here.'} />
    </section>
  </section>;
}
function StatCard({ label, value, foot, icon }: { label: string; value: string; foot: string; icon: ReactNode }) { return <div className="stat-card"><div className="stat-head"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong className="stat-value">{value}</strong><span className="stat-foot">{foot}</span></div>; }

function DocumentTable({ documents, onPreview, emptyTitle, emptyText }: { documents: BillingDocument[]; onPreview: (doc: BillingDocument) => void; emptyTitle: string; emptyText: string }) {
  if (!documents.length) return <div className="empty-state"><span className="empty-icon"><ClipboardList size={22} /></span><strong>{emptyTitle}</strong><p>{emptyText}</p></div>;
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>Document</th><th>Customer</th><th>Date</th><th>Status</th><th className="right">Amount</th><th /></tr></thead><tbody>{documents.map(doc => <tr key={doc.id}><td><button className="document-link" onClick={() => onPreview(doc)}><span className={`doc-type-icon ${doc.document_type}`}><FileText size={16} /></span><span><strong>{doc.document_number}</strong><small>{doc.document_type === 'bill' ? 'Bill / invoice' : 'Delivery challan'}</small></span></button></td><td>{doc.customer_snapshot?.name || <span className="muted">—</span>}</td><td className="nowrap">{displayDate(doc.issue_date)}</td><td><span className={`status-pill ${doc.status}`}>{doc.status === 'finalized' ? 'Finalized' : 'Draft'}</span></td><td className="right nowrap">{money(doc.total)}</td><td><button className="icon-button" onClick={() => onPreview(doc)} aria-label={`View ${doc.document_number}`}><ArrowRight size={16} /></button></td></tr>)}</tbody></table></div>;
}

function ProductsPage({ products, reload }: { products: Product[]; reload: () => Promise<void> }) {
  const emptyForm = { name: '', sku: '', unit: '', description: '', rate: '0', stock_quantity: '' };
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Product | null>(null);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const results = products.filter(p => `${p.name} ${p.sku || ''} ${p.description || ''}`.toLowerCase().includes(query.toLowerCase()));
  const change = (key: keyof typeof emptyForm, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const beginEdit = (p: Product) => { setEditing(p); setForm({ name: p.name, sku: p.sku || '', unit: p.unit || '', description: p.description || '', rate: String(p.rate), stock_quantity: p.stock_quantity == null ? '' : String(p.stock_quantity) }); setShowForm(true); setError(''); setSuccess(''); };
  const closeForm = () => { setEditing(null); setForm(emptyForm); setShowForm(false); setError(''); };
  async function save(event: FormEvent) {
    event.preventDefault(); 
    if (!form.name.trim() || !Number.isFinite(Number(form.rate)) || Number(form.rate) < 0 || (form.stock_quantity !== '' && (!Number.isFinite(Number(form.stock_quantity)) || Number(form.stock_quantity) < 0))) { setError('Enter a product name, a non-negative rate, and a valid stock quantity.'); return; }
    setBusy(true); setError(''); setSuccess('');
    const payload = { name: form.name.trim(), sku: form.sku.trim() || null, unit: form.unit.trim() || null, description: form.description.trim() || null, rate: Number(form.rate), stock_quantity: form.stock_quantity === '' ? null : Number(form.stock_quantity) };
    try {
      const result = editing ? await localStore.from('products').update(payload).eq('id', editing.id) : await localStore.from('products').insert(payload);
      if (result.error) throw result.error;
      await reload(); setSuccess(editing ? 'Product updated.' : 'Product added.'); closeForm();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function remove(product: Product) {
    if (!window.confirm(`Delete “${product.name}” from the catalogue? Existing finalized documents will keep their saved item details.`)) return;
    setError(''); setSuccess(''); const { error: delError } = await localStore.from('products').delete().eq('id', product.id);
    if (delError) setError(errorMessage(delError)); else { setSuccess('Product deleted.'); await reload(); }
  }
  return <section className="page-section"><PageHeader eyebrow="PRODUCT CATALOGUE" title="Add items" description="Maintain products and their default rates. A rate changed on a bill will not change this catalogue." action={<button className="button button-primary" onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(v => !v); setError(''); }}><Plus size={17} /> Add product</button>} />
    {success && <div className="alert alert-success local-alert"><Check size={16} /> {success}<button className="icon-button" onClick={() => setSuccess('')}><X size={15} /></button></div>}
    {showForm && <form className="panel editor-form" onSubmit={save}><div className="panel-heading"><div><h2>{editing ? 'Edit product' : 'New product'}</h2><p>Fields marked optional can be left blank.</p></div><button type="button" className="icon-button" onClick={closeForm} aria-label="Close form"><X size={18} /></button></div><div className="form-grid two-col"><label>Product name *<input value={form.name} onChange={e => change('name', e.target.value)} required placeholder="e.g. Cotton T-shirt" /></label><label>Default rate (₹) *<input type="number" min="0" step="0.01" value={form.rate} onChange={e => change('rate', e.target.value)} required /></label><label>SKU / product code<input value={form.sku} onChange={e => change('sku', e.target.value)} placeholder="Optional" /></label><label>Unit<input value={form.unit} onChange={e => change('unit', e.target.value)} placeholder="e.g. pcs, kg, box" /></label><label>Stock quantity<input type="number" min="0" step="any" value={form.stock_quantity} onChange={e => change('stock_quantity', e.target.value)} placeholder="Optional" /></label><label className="span-two">Description<textarea rows={2} value={form.description} onChange={e => change('description', e.target.value)} placeholder="Optional product notes" /></label></div>{error && <div className="alert alert-error">{error}</div>}<div className="form-actions"><button type="button" className="button button-secondary" onClick={closeForm}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save product'}</button></div></form>}
    {error && !showForm && <div className="alert alert-error local-alert">{error}</div>}
    <div className="panel listing-panel"><div className="table-toolbar listing-toolbar"><div><h2>Saved products <span className="count-muted">{products.length}</span></h2><p>Products are private to your shop.</p></div><div className="search-wrap"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search products…" /></div></div>
      {!results.length ? <div className="empty-state"><span className="empty-icon"><Boxes size={23} /></span><strong>{query ? 'No products match your search' : 'Your catalogue is empty'}</strong><p>{query ? 'Try another name or product code.' : 'Add products once and reuse them in every bill or challan.'}</p>{!query && <button className="button button-secondary" onClick={() => setShowForm(true)}><Plus size={16} /> Add your first product</button>}</div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Product</th><th>SKU</th><th>Stock</th><th className="right">Default rate</th><th className="right">Actions</th></tr></thead><tbody>{results.map(p => <tr key={p.id}><td><div className="product-name-cell"><span className="product-square"><ShoppingBag size={16} /></span><span><strong>{p.name}</strong><small>{p.description || p.unit || 'Product'}</small></span></div></td><td>{p.sku || <span className="muted">—</span>}</td><td>{p.stock_quantity == null ? <span className="muted">Not tracked</span> : `${p.stock_quantity}${p.unit ? ` ${p.unit}` : ''}`}</td><td className="right nowrap">{money(p.rate)}</td><td><div className="row-actions"><button className="button button-small button-secondary" onClick={() => beginEdit(p)}>Edit</button><button className="icon-button danger-icon" onClick={() => void remove(p)} title="Delete product"><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div>}
    </div>
  </section>;
}

function CustomersPage({ customers, documents, reload, onCreateBill, onOpenDocument }: { customers: Customer[]; documents: BillingDocument[]; reload: () => Promise<void>; onCreateBill: (customer: Customer) => void; onOpenDocument: (doc: BillingDocument) => void }) {
  const emptyForm = { name: '', phone: '', address: '', photo_url: '' };
  const [form, setForm] = useState(emptyForm); const [editing, setEditing] = useState<Customer | null>(null); const [showForm, setShowForm] = useState(false); const [query, setQuery] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const change = (key: keyof typeof emptyForm, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const beginEdit = (c: Customer) => { setEditing(c); setForm({ name: c.name, phone: c.phone || '', address: c.address || '', photo_url: c.photo_url || '' }); setShowForm(true); setError(''); };
  const close = () => { setShowForm(false); setEditing(null); setForm(emptyForm); setError(''); };
  async function save(event: FormEvent) { event.preventDefault();  if (!form.name.trim()) { setError('Customer name is required.'); return; } if (form.photo_url && !/^https?:\/\//i.test(form.photo_url)) { setError('Photo URL must start with http:// or https://.'); return; } setBusy(true); setError('');
    try { const payload = { name: form.name.trim(), phone: form.phone.trim() || null, address: form.address.trim() || null, photo_url: form.photo_url.trim() || null }; const result = editing ? await localStore.from('customers').update(payload).eq('id', editing.id) : await localStore.from('customers').insert(payload); if (result.error) throw result.error; await reload(); setSuccess(editing ? 'Customer updated.' : 'Customer added.'); close(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function remove(customer: Customer) { if (!window.confirm(`Delete customer “${customer.name}”? Existing documents retain the customer details saved on them.`)) return; const { error: delError } = await localStore.from('customers').delete().eq('id', customer.id); if (delError) setError(errorMessage(delError)); else { setSuccess('Customer deleted.'); await reload(); } }
  const results = customers.filter(c => `${c.name} ${c.phone || ''} ${c.address || ''}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="page-section"><PageHeader eyebrow="CUSTOMER DIRECTORY" title="Customers" description="Save customer details once and reuse them across future documents." action={<button className="button button-primary" onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(v => !v); }}><Plus size={17} /> Add customer</button>} />
    {success && <div className="alert alert-success local-alert"><Check size={16} /> {success}<button className="icon-button" onClick={() => setSuccess('')}><X size={15} /></button></div>}
    {showForm && <form className="panel editor-form" onSubmit={save}><div className="panel-heading"><div><h2>{editing ? 'Edit customer' : 'New customer'}</h2><p>Name is required. Other details are optional.</p></div><button type="button" className="icon-button" onClick={close} aria-label="Close form"><X size={18} /></button></div><div className="form-grid two-col"><label>Customer name *<input value={form.name} onChange={e => change('name', e.target.value)} required placeholder="Full name or business name" /></label><label>Mobile number<input value={form.phone} onChange={e => change('phone', e.target.value)} type="tel" placeholder="Include country code if needed" /></label><label className="span-two">Address<textarea rows={2} value={form.address} onChange={e => change('address', e.target.value)} placeholder="Optional address" /></label><label className="span-two">Photo URL (optional)<input type="url" value={form.photo_url} onChange={e => change('photo_url', e.target.value)} placeholder="https://…" /><span className="field-hint">Use a URL to an image already hosted online.</span></label></div>{error && <div className="alert alert-error">{error}</div>}<div className="form-actions"><button type="button" className="button button-secondary" onClick={close}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save customer'}</button></div></form>}
    {error && !showForm && <div className="alert alert-error local-alert">{error}</div>}
    <div className="panel listing-panel"><div className="table-toolbar listing-toolbar"><div><h2>Saved customers <span className="count-muted">{customers.length}</span></h2><p>Customer details are stored in your private workspace.</p></div><div className="search-wrap"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search customers…" /></div></div>
      {!results.length ? <div className="empty-state"><span className="empty-icon"><Users size={22} /></span><strong>{query ? 'No matching customers' : 'No customers added'}</strong><p>{query ? 'Try a different search.' : 'Add a customer to make billing faster next time.'}</p></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Customer</th><th>Phone</th><th>Previous documents</th><th className="right">Actions</th></tr></thead><tbody>{results.map(c => { const docs = documents.filter(d => d.customer_id === c.id || d.customer_snapshot?.name === c.name); return <tr key={c.id}><td><div className="product-name-cell">{c.photo_url ? <img className="customer-photo" src={c.photo_url} alt="" /> : <span className="avatar-small">{c.name.slice(0, 1).toUpperCase()}</span>}<span><strong>{c.name}</strong><small>{c.address || 'No address saved'}</small></span></div></td><td>{c.phone || <span className="muted">—</span>}</td><td><span className="count-muted">{docs.length}</span></td><td><div className="row-actions"><button className="button button-small button-secondary" onClick={() => onCreateBill(c)}>New bill</button><button className="button button-small button-ghost" onClick={() => beginEdit(c)}>Edit</button><button className="icon-button danger-icon" onClick={() => void remove(c)} aria-label={`Delete ${c.name}`}><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table></div>}
    </div>
    {customers.length > 0 && <div className="panel previous-docs"><div className="panel-heading"><div><h2>Recently used customer documents</h2><p>Open a previous record from here.</p></div></div><div className="document-chip-list">{documents.filter(d => d.customer_snapshot).slice(0, 5).map(d => <button className="document-chip" key={d.id} onClick={() => onOpenDocument(d)}><FileText size={16} /><span><strong>{d.document_number}</strong><small>{d.customer_snapshot?.name}</small></span><ArrowRight size={15} /></button>)}</div></div>}
  </section>;
}

function HistoryPage({ documents, profile, onPreview, onEditDraft, onReload }: { documents: BillingDocument[]; profile: ShopProfile | null; onPreview: (doc: BillingDocument) => void; onEditDraft: (doc: BillingDocument) => void; onReload: () => Promise<void> }) {
  const [query, setQuery] = useState(''); const [type, setType] = useState('all'); const [status, setStatus] = useState('all'); const [fromDate, setFromDate] = useState(''); const [toDate, setToDate] = useState('');
  const results = documents.filter(d => (!query || `${d.document_number} ${d.customer_snapshot?.name || ''}`.toLowerCase().includes(query.toLowerCase())) && (type === 'all' || d.document_type === type) && (status === 'all' || d.status === status) && (!fromDate || d.issue_date >= fromDate) && (!toDate || d.issue_date <= toDate));
  return <section className="page-section"><PageHeader eyebrow="DOCUMENT ARCHIVE" title="Bills history" description="Find, review, download, or share saved bills and challans." action={<button className="button button-secondary" onClick={() => void onReload()}><Activity size={16} /> Refresh</button>} />
    <div className="panel listing-panel"><div className="history-filters"><div className="search-wrap search-wide"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search number or customer…" /></div><label className="filter-field"><Filter size={14} /><select value={type} onChange={e => setType(e.target.value)}><option value="all">All types</option><option value="bill">Bills</option><option value="challan">Challans</option></select></label><label className="filter-field"><select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="finalized">Finalized</option><option value="draft">Drafts</option></select></label><label className="date-filter">From<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></label><label className="date-filter">To<input type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></label></div>
      <div className="history-summary"><span>{results.length} document{results.length === 1 ? '' : 's'}</span><span className="muted">Finalized bill value: {money(results.filter(d => d.status === 'finalized' && d.document_type === 'bill').reduce((s, d) => s + Number(d.total), 0))}</span></div>
      {!results.length ? <div className="empty-state"><span className="empty-icon"><ClipboardList size={22} /></span><strong>No documents found</strong><p>Adjust your filters or create a new bill or challan.</p></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Document</th><th>Customer</th><th>Date</th><th>Status</th><th className="right">Amount</th><th className="right">Actions</th></tr></thead><tbody>{results.map(d => <tr key={d.id}><td><button className="document-link" onClick={() => onPreview(d)}><span className={`doc-type-icon ${d.document_type}`}><FileText size={16} /></span><span><strong>{d.document_number}</strong><small>{d.document_type === 'bill' ? 'Bill / invoice' : 'Delivery challan'}</small></span></button></td><td>{d.customer_snapshot?.name || '—'}</td><td className="nowrap">{displayDate(d.issue_date)}</td><td><span className={`status-pill ${d.status}`}>{d.status === 'finalized' ? 'Finalized' : 'Draft'}</span></td><td className="right nowrap">{money(d.total)}</td><td><div className="row-actions right-actions">{d.status === 'draft' && <button className="button button-small button-secondary" onClick={() => onEditDraft(d)}>Edit draft</button>}<button className="icon-button" onClick={() => onPreview(d)} title="Preview"><ArrowRight size={16} /></button><button className="icon-button" onClick={() => downloadDocumentPdf(d, profile)} title="Download PDF"><ArrowDownToLine size={16} /></button><button className="icon-button" onClick={() => shareWhatsApp(d)} title="Send on WhatsApp"><PhoneIconFallback /></button></div></td></tr>)}</tbody></table></div>}
    </div>
  </section>;
}
function PhoneIconFallback() { return <span className="whatsapp-glyph">WA</span>; }
function shareWhatsApp(doc: BillingDocument) { const phone = normalisePhone(doc.customer_snapshot?.phone || ''); if (!phone) { window.alert('This customer has no saved phone number. Add a phone number to the customer record before sharing.'); return; } const shopName = doc.shop_snapshot?.shop_name || 'Our shop'; const text = doc.document_type === 'bill' ? `Hello ${doc.customer_snapshot?.name || ''}, this is ${shopName}. Your bill ${doc.document_number} total is ${money(doc.total)}. Please find the PDF attached separately after downloading it from the app.` : `Hello ${doc.customer_snapshot?.name || ''}, this is ${shopName}. Delivery challan ${doc.document_number} is ready. Please find the PDF attached separately after downloading it from the app.`; window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer'); }

function SettingsPage({ profile, onSaved }: { profile: ShopProfile; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ owner_name: profile.owner_name || '', shop_name: profile.shop_name || '', phone: profile.phone || '', address: profile.address || '', logo_url: profile.logo_url || '' }); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  useEffect(() => setForm({ owner_name: profile.owner_name || '', shop_name: profile.shop_name || '', phone: profile.phone || '', address: profile.address || '', logo_url: profile.logo_url || '' }), [profile]);
  function change(key: keyof typeof form, value: string) { setForm(prev => ({ ...prev, [key]: value })); }
  async function save(event: FormEvent) { event.preventDefault();  if (!form.shop_name.trim() || !form.owner_name.trim()) { setError('Owner name and shop name are required.'); return; } if (form.logo_url && !/^https?:\/\//i.test(form.logo_url)) { setError('Logo URL must start with http:// or https://.'); return; } setBusy(true); setError(''); setSuccess(''); try { const { error: saveError } = await localStore.from('shop_profiles').update({ owner_name: form.owner_name.trim(), shop_name: form.shop_name.trim(), phone: form.phone.trim() || null, address: form.address.trim() || null, logo_url: form.logo_url.trim() || null }).eq('user_id', profile.user_id); if (saveError) throw saveError; await onSaved(); setSuccess('Shop profile saved.'); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }
  return <section className="page-section settings-page"><PageHeader eyebrow="WORKSPACE PREFERENCES" title="Shop settings" description="These details appear on new bills and challans. Past documents keep their original snapshot." />
    {success && <div className="alert alert-success local-alert"><Check size={16} /> {success}</div>}
    <form className="panel settings-panel" onSubmit={save}><div className="panel-heading"><div><h2>Shop information</h2><p>Keep your business details up to date.</p></div><span className="setting-lock"><Check size={15} /> Private workspace</span></div><div className="settings-identity"><div className="large-shop-avatar">{form.shop_name.slice(0, 1).toUpperCase() || <Store size={26} />}</div><div><h3>{form.shop_name || 'Your shop name'}</h3><p>{form.owner_name || 'Shop owner'}</p><span className="muted tiny">Currency is set to Indian Rupees (₹).</span></div></div>
      <div className="form-grid two-col"><label>Owner’s name *<input value={form.owner_name} onChange={e => change('owner_name', e.target.value)} required /></label><label>Shop name *<input value={form.shop_name} onChange={e => change('shop_name', e.target.value)} required /></label><label>Contact number<input type="tel" value={form.phone} onChange={e => change('phone', e.target.value)} placeholder="Business phone number" /></label><label>Logo URL (optional)<input type="url" value={form.logo_url} onChange={e => change('logo_url', e.target.value)} placeholder="https://…" /></label><label className="span-two">Shop address<textarea rows={3} value={form.address} onChange={e => change('address', e.target.value)} placeholder="Street, area, city, state, PIN" /></label></div>
      {error && <div className="alert alert-error">{error}</div>}<div className="form-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save shop details'}</button></div>
    </form>
    <div className="panel security-panel"><div className="section-title-row"><div className="section-title-icon"><Settings2 size={18} /></div><div><h2>Account and security</h2><p>This workspace is saved in this browser only; it does not sync to other devices.</p></div></div><div className="security-info-row"><div><strong>Sign-in email</strong><span>{'Local account email'}</span></div><button type="button" className="button button-secondary button-small" onClick={async () => { const { data } = await localStore.auth.getUser(); if (data.user?.email) window.alert(`Local account: ${data.user.email}\n\nThis account exists in this browser only. Email password resets are not available in the browser-only version.`); }}>View account</button></div></div>
  </section>;
}

function DocumentPreview({ document, profile, onClose, onEdit }: { document: BillingDocument; profile: ShopProfile | null; onClose: () => void; onEdit: (doc: BillingDocument) => void }) {
  const items = document.items || [];
  return <div className="modal-scrim" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title"><div className="preview-top"><div><span className="eyebrow">DOCUMENT PREVIEW</span><h2 id="preview-title">{document.document_number}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close preview"><X size={20} /></button></div><div className="preview-paper"><div className="preview-paper-header"><div><strong>{document.shop_snapshot?.shop_name || profile?.shop_name || 'Your shop'}</strong><span>{document.shop_snapshot?.address || profile?.address || ''}</span><span>{document.shop_snapshot?.phone || profile?.phone || ''}</span></div><div className="preview-doc-meta"><strong>{document.document_type === 'bill' ? 'BILL / INVOICE' : 'DELIVERY CHALLAN'}</strong><span>{document.document_number}</span><span>{displayDate(document.issue_date)}</span><span className={`status-pill ${document.status}`}>{document.status}</span></div></div>{document.customer_snapshot && <div className="preview-customer"><span className="muted tiny">CUSTOMER</span><strong>{document.customer_snapshot.name}</strong><span>{document.customer_snapshot.phone || ''}</span><span>{document.customer_snapshot.address || ''}</span></div>}
      <div className="table-scroll"><table className="data-table preview-items"><thead><tr><th>Item</th><th className="right">Qty</th><th className="right">Rate</th><th className="right">Amount</th></tr></thead><tbody>{items.map((i, n) => <tr key={i.id || n}><td><strong>{i.name_snapshot}</strong><small>{i.sku_snapshot || ''}</small></td><td className="right">{i.quantity}{i.unit_snapshot ? ` ${i.unit_snapshot}` : ''}</td><td className="right">{money(i.rate)}</td><td className="right">{money(i.line_total ?? i.quantity * i.rate)}</td></tr>)}</tbody></table></div>
      <div className="preview-totals"><div><span>Subtotal</span><strong>{money(document.subtotal)}</strong></div>{document.discount_amount > 0 && <div><span>Discount</span><strong>− {money(document.discount_amount)}</strong></div>}{document.tax_rate > 0 && <div><span>Tax ({document.tax_rate}%)</span><strong>{money(document.tax_amount)}</strong></div>}<div className="preview-grand-total"><span>Total</span><strong>{money(document.total)}</strong></div></div>{document.notes && <div className="preview-notes"><strong>Notes</strong><p>{document.notes}</p></div>}</div>
      <div className="preview-actions">{document.status === 'draft' && <button className="button button-secondary" onClick={() => onEdit(document)}>Edit draft</button>}<button className="button button-secondary" onClick={() => downloadDocumentPdf(document, profile)}><ArrowDownToLine size={17} /> Download PDF</button><button className="button button-secondary" onClick={() => shareWhatsApp(document)}>Send on WhatsApp <ArrowRight size={16} /></button><button className="button button-primary" onClick={onClose}>Done</button></div>{document.status === 'finalized' && <p className="muted tiny preview-lock-note">Finalized documents are read-only. To share on WhatsApp, download the PDF first and attach it in WhatsApp.</p>}</section></div>;
}
