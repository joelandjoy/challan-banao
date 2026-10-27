/**
 * Browser-only persistence adapter for Ledger.
 * No server or cloud database is used. Data is stored in this browser's localStorage.
 * This is convenient for a single-device setup, but it is not a security boundary
 * and does not sync to other browsers/devices.
 */
import type { BillingDocument, CustomerSnapshot, DocumentItem, DocumentType, ShopProfile, ShopSnapshot } from '../types';

type Metadata = { owner_name?: string; shop_name?: string };
export type LocalUser = { id: string; email: string; user_metadata: Metadata };
export type LocalSession = { user: LocalUser };
type StoredUser = LocalUser & { salt: string; password_hash: string };
type Row = Record<string, any>;
type Database = { users: StoredUser[]; shop_profiles: Row[]; products: Row[]; customers: Row[]; documents: Row[] };
type DbResult<T = any> = { data: T; error: Error | null };

const DB_KEY = 'ledger.browser.db.v1';
const SESSION_KEY = 'ledger.browser.session.v1';
const EMPTY_DB: Database = { users: [], shop_profiles: [], products: [], customers: [], documents: [] };
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const copy = <T,>(value: T): T => value == null ? value : JSON.parse(JSON.stringify(value)) as T;
const getDb = (): Database => {
  if (typeof window === 'undefined') return copy(EMPTY_DB);
  try {
    const raw = window.localStorage.getItem(DB_KEY);
    if (!raw) return copy(EMPTY_DB);
    const parsed = JSON.parse(raw) as Partial<Database>;
    return { ...copy(EMPTY_DB), ...parsed };
  } catch {
    return copy(EMPTY_DB);
  }
};
const saveDb = (db: Database) => window.localStorage.setItem(DB_KEY, JSON.stringify(db));
const getSessionUserId = (): string | null => {
  try { return window.localStorage.getItem(SESSION_KEY); } catch { return null; }
};
const findStoredUser = (userId: string | null | undefined) => userId ? getDb().users.find(user => user.id === userId) || null : null;
const publicUser = (user: StoredUser): LocalUser => ({ id: user.id, email: user.email, user_metadata: copy(user.user_metadata || {}) });
const makeSession = (user: StoredUser | null): LocalSession | null => user ? ({ user: publicUser(user) }) : null;
const activeUser = () => findStoredUser(getSessionUserId());
const setSession = (user: StoredUser | null, event: 'SIGNED_IN' | 'SIGNED_OUT' | 'USER_UPDATED') => {
  if (user) window.localStorage.setItem(SESSION_KEY, user.id);
  else window.localStorage.removeItem(SESSION_KEY);
  const session = makeSession(user);
  listeners.forEach(listener => listener(event, session));
};
const listeners = new Set<(event: string, session: LocalSession | null) => void>();

async function passwordHash(password: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function randomSalt(): string {
  const data = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(data, byte => byte.toString(16).padStart(2, '0')).join('');
}
function asError(message: string) { return new Error(message); }

class LocalQuery implements PromiseLike<DbResult> {
  private action: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private filters: Array<[string, unknown]> = [];
  private sort: { column: string; ascending: boolean } | null = null;
  private maxRows: number | null = null;
  private singleMode: 'single' | 'maybeSingle' | null = null;
  private returnRows = false;

  constructor(private table: string) {}
  select(_columns = '*') { this.returnRows = true; return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.sort = { column, ascending: options?.ascending !== false }; return this; }
  limit(count: number) { this.maxRows = count; return this; }
  maybeSingle() { this.singleMode = 'maybeSingle'; return this; }
  single() { this.singleMode = 'single'; return this; }
  insert(payload: Row | Row[]) { this.action = 'insert'; this.payload = payload; return this; }
  upsert(payload: Row | Row[]) { this.action = 'upsert'; this.payload = payload; return this; }
  update(payload: Row) { this.action = 'update'; this.payload = payload; return this; }
  delete() { this.action = 'delete'; return this; }

  private execute(): DbResult {
    const db = getDb();
    if (!['shop_profiles', 'products', 'customers', 'documents'].includes(this.table)) return { data: null, error: asError(`Unknown table: ${this.table}`) };
    const table = db[this.table as keyof Pick<Database, 'shop_profiles' | 'products' | 'customers' | 'documents'>] as Row[];
    const uid = getSessionUserId();
    if (!uid) return { data: this.singleMode ? null : [], error: asError('Please sign in again to continue.') };
    const visible = (row: Row) => row.user_id === uid && this.filters.every(([column, value]) => row[column] === value);
    let result: Row[] = [];

    if (this.action === 'insert') {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload || {}];
      for (const item of incoming) {
        const row = { ...copy(item), id: item.id || id(), user_id: uid, created_at: item.created_at || now() };
        table.push(row); result.push(row);
      }
    } else if (this.action === 'upsert') {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload || {}];
      for (const item of incoming) {
        const row = table.find(existing => existing.user_id === uid && ((item.id && existing.id === item.id) || (item.user_id && existing.user_id === item.user_id)));
        if (row) { Object.assign(row, copy(item), { user_id: uid }); result.push(row); }
        else { const created = { ...copy(item), id: item.id || id(), user_id: uid, created_at: item.created_at || now() }; table.push(created); result.push(created); }
      }
    } else if (this.action === 'update') {
      for (const row of table) if (visible(row)) { Object.assign(row, copy(this.payload || {})); result.push(row); }
    } else if (this.action === 'delete') {
      const deleted = table.filter(visible);
      const keep = table.filter(row => !visible(row));
      table.splice(0, table.length, ...keep);
      result = deleted;
    } else {
      result = table.filter(visible).map(row => copy(row));
    }

    if (this.sort) {
      const { column, ascending } = this.sort;
      result.sort((a, b) => {
        const av = a[column] ?? ''; const bv = b[column] ?? '';
        const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return ascending ? cmp : -cmp;
      });
    }
    if (this.maxRows != null) result = result.slice(0, this.maxRows);
    saveDb(db);
    if (this.singleMode === 'single') {
      if (!result.length) return { data: null, error: asError('Expected one record, but none was found.') };
      return { data: copy(result[0]), error: null };
    }
    if (this.singleMode === 'maybeSingle') return { data: result.length ? copy(result[0]) : null, error: null };
    return { data: this.returnRows || this.action === 'select' ? copy(result) : null, error: null };
  }

  then<TResult1 = DbResult, TResult2 = never>(onfulfilled?: ((value: DbResult) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> {
    return Promise.resolve().then(() => this.execute()).then(onfulfilled, onrejected);
  }
}

function currentShopProfile(userId: string): ShopProfile | null {
  const profile = getDb().shop_profiles.find(row => row.user_id === userId);
  return profile ? profile as ShopProfile : null;
}

function saveDocument(pDocument: Record<string, any>, pItems: Array<Record<string, any>>): DbResult<string> {
  const user = activeUser();
  if (!user) return { data: null as unknown as string, error: asError('Your session has expired. Please sign in again.') };
  if (!Array.isArray(pItems)) return { data: null as unknown as string, error: asError('Document items are invalid.') };
  if (!Number.isFinite(Number(pDocument.discount_amount)) || Number(pDocument.discount_amount) < 0) return { data: null as unknown as string, error: asError('Discount must be a non-negative amount.') };
  if (!Number.isFinite(Number(pDocument.tax_rate)) || Number(pDocument.tax_rate) < 0 || Number(pDocument.tax_rate) > 100) return { data: null as unknown as string, error: asError('Tax rate must be between 0% and 100%.') };
  if (pItems.some(item => !String(item.name || '').trim() || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.rate)) || Number(item.rate) < 0)) return { data: null as unknown as string, error: asError('One or more item quantities or rates are invalid.') };

  const db = getDb();
  const docs = db.documents;
  const existingIndex = pDocument.id ? docs.findIndex(doc => doc.id === pDocument.id && doc.user_id === user.id) : -1;
  const existing = existingIndex >= 0 ? docs[existingIndex] : null;
  if (pDocument.id && !existing) return { data: null as unknown as string, error: asError('This draft could not be found. Refresh the page and try again.') };
  if (existing?.status === 'finalized') return { data: null as unknown as string, error: asError('Finalized documents are read-only.') };
  const type = (pDocument.document_type === 'challan' ? 'challan' : 'bill') as DocumentType;
  const profile = currentShopProfile(user.id);
  const customer = pDocument.customer_id ? db.customers.find(row => row.id === pDocument.customer_id && row.user_id === user.id) : null;
  const shopSnapshot: ShopSnapshot = {
    owner_name: profile?.owner_name || '', shop_name: profile?.shop_name || '',
    address: profile?.address || null, phone: profile?.phone || null, logo_url: profile?.logo_url || null,
  };
  const customerSnapshot: CustomerSnapshot | null = customer ? {
    name: String(customer.name), phone: customer.phone || null, address: customer.address || null,
  } : null;
  const subtotal = pItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.rate), 0);
  const discount = Number(pDocument.discount_amount) || 0;
  if (discount > subtotal) return { data: null as unknown as string, error: asError('Discount cannot be greater than the subtotal.') };
  const taxRate = Number(pDocument.tax_rate) || 0;
  const taxAmount = (subtotal - discount) * taxRate / 100;
  const total = subtotal - discount + taxAmount;
  let docNumber = existing?.document_number;
  if (!docNumber) {
    const prefix = type === 'bill' ? 'Bill' : 'Challan';
    const maxSequence = docs.filter(doc => doc.user_id === user.id && doc.document_type === type).reduce((max, doc) => {
      const match = String(doc.document_number || '').match(/-(\d+)$/); return Math.max(max, match ? Number(match[1]) : 0);
    }, 0);
    docNumber = `${prefix}-${String(maxSequence + 1).padStart(4, '0')}`;
  }
  const documentId = existing?.id || id();
  const items: DocumentItem[] = pItems.map(item => ({
    id: id(), document_id: documentId, product_id: item.product_id || null,
    name_snapshot: String(item.name).trim(), sku_snapshot: item.sku || null, unit_snapshot: item.unit || null,
    quantity: Number(item.quantity), rate: Number(item.rate), line_total: Number(item.quantity) * Number(item.rate),
  }));
  const document: BillingDocument = {
    id: documentId, user_id: user.id, document_type: type, document_number: docNumber,
    status: pDocument.status === 'finalized' ? 'finalized' : 'draft', customer_id: customer?.id || null,
    customer_snapshot: customerSnapshot, shop_snapshot: shopSnapshot,
    issue_date: String(pDocument.issue_date || new Date().toISOString().slice(0, 10)), subtotal,
    discount_amount: discount, tax_rate: taxRate, tax_amount: taxAmount, total,
    notes: pDocument.notes || null, created_at: existing?.created_at || now(), updated_at: now(),
    finalized_at: pDocument.status === 'finalized' ? (existing?.finalized_at || now()) : null, items,
  };
  if (existingIndex >= 0) docs[existingIndex] = document as unknown as Row;
  else docs.push(document as unknown as Row);
  saveDb(db);
  return { data: documentId, error: null };
}

export const localStore = {
  auth: {
    async getSession() { return { data: { session: makeSession(activeUser()) }, error: null }; },
    onAuthStateChange(callback: (event: string, session: LocalSession | null) => void) {
      listeners.add(callback);
      callback('INITIAL_SESSION', makeSession(activeUser()));
      return { data: { subscription: { unsubscribe: () => { listeners.delete(callback); } } } };
    },
    async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Metadata } }) {
      const normalEmail = email.trim().toLowerCase();
      if (!normalEmail) return { data: { user: null, session: null }, error: asError('Email is required.') };
      if (getDb().users.some(user => user.email.toLowerCase() === normalEmail)) return { data: { user: null, session: null }, error: asError('An account with this email already exists in this browser. Please sign in instead.') };
      if (password.length < 8) return { data: { user: null, session: null }, error: asError('Password must contain at least 8 characters.') };
      const db = getDb();
      const salt = randomSalt();
      const user: StoredUser = { id: id(), email: normalEmail, user_metadata: copy(options?.data || {}), salt, password_hash: await passwordHash(password, salt) };
      db.users.push(user); saveDb(db); setSession(user, 'SIGNED_IN');
      return { data: { user: publicUser(user), session: makeSession(user) }, error: null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const normalEmail = email.trim().toLowerCase();
      const user = getDb().users.find(candidate => candidate.email.toLowerCase() === normalEmail);
      if (!user || await passwordHash(password, user.salt) !== user.password_hash) return { data: { user: null, session: null }, error: asError('Email or password is incorrect for an account saved in this browser.') };
      setSession(user, 'SIGNED_IN');
      return { data: { user: publicUser(user), session: makeSession(user) }, error: null };
    },
    async signOut() { setSession(null, 'SIGNED_OUT'); return { error: null }; },
    async getUser() { const user = activeUser(); return { data: { user: user ? publicUser(user) : null }, error: null }; },
    async updateUser({ password }: { password?: string }) {
      const userId = getSessionUserId();
      const db = getDb(); const user = db.users.find(candidate => candidate.id === userId);
      if (!user) return { data: { user: null }, error: asError('Please sign in again.') };
      if (password) { user.salt = randomSalt(); user.password_hash = await passwordHash(password, user.salt); saveDb(db); setSession(user, 'USER_UPDATED'); }
      return { data: { user: publicUser(user) }, error: null };
    },
    async resetPasswordForEmail(_email: string) { return { data: null, error: asError('Email password resets require a backend. This browser-only version cannot send email.') }; },
  },
  from(table: string) { return new LocalQuery(table); },
  async rpc(name: string, args: { p_document: Record<string, any>; p_items: Array<Record<string, any>> }) {
    if (name !== 'save_document') return { data: null, error: asError(`Unknown local operation: ${name}`) };
    return saveDocument(args.p_document, args.p_items);
  },
};
