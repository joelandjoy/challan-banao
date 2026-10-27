import { useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Plus, Trash2, FileText, Truck, Search } from 'lucide-react';
import type { BillingDocument, Customer, DocumentType, Product } from '../types';
import { localStore } from '../lib/localStore';
import { displayDate, errorMessage, money } from '../lib/format';

type DraftItem = { key: string; product_id: string | null; name_snapshot: string; sku_snapshot: string | null; unit_snapshot: string | null; quantity: number; rate: number };

interface Props {
  type: DocumentType;
  products: Product[];
  customers: Customer[];
  onCancel: () => void;
  onSaved: (id: string, status: 'draft' | 'finalized') => void;
  initial?: BillingDocument | null;
  initialCustomerId?: string;
}

export default function DocumentEditor({ type, products, customers, onCancel, onSaved, initial, initialCustomerId }: Props) {
  const [customerId, setCustomerId] = useState(initial?.customer_id || initialCustomerId || '');
  const [chosenProduct, setChosenProduct] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [items, setItems] = useState<DraftItem[]>(() => (initial?.items || []).map((item, i) => ({
    key: item.id || `initial-${i}`, product_id: item.product_id, name_snapshot: item.name_snapshot,
    sku_snapshot: item.sku_snapshot, unit_snapshot: item.unit_snapshot,
    quantity: Number(item.quantity), rate: Number(item.rate),
  })));
  const [discount, setDiscount] = useState(String(initial?.discount_amount ?? 0));
  const [taxRate, setTaxRate] = useState(String(initial?.tax_rate ?? 0));
  const [issueDate, setIssueDate] = useState(initial?.issue_date || new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(initial?.notes || '');
  const status: 'draft' | 'finalized' = initial?.status || 'draft';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filteredProducts = useMemo(() => products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) || (p.sku || '').toLowerCase().includes(productSearch.toLowerCase())), [products, productSearch]);
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const discountValue = Math.max(0, Number(discount) || 0);
  const safeDiscount = Math.min(discountValue, subtotal);
  const taxValue = Math.max(0, Math.min(100, Number(taxRate) || 0));
  const taxAmount = (subtotal - safeDiscount) * taxValue / 100;
  const total = subtotal - safeDiscount + taxAmount;
  const customer = customers.find(c => c.id === customerId);

  function addProduct(event?: FormEvent) {
    event?.preventDefault();
    const product = products.find(p => p.id === chosenProduct);
    if (!product) return;
    setItems(prev => [...prev, { key: `${Date.now()}-${Math.random()}`, product_id: product.id, name_snapshot: product.name, sku_snapshot: product.sku, unit_snapshot: product.unit, quantity: 1, rate: Number(product.rate) }]);
    setChosenProduct(''); setProductSearch('');
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems(prev => prev.map(item => item.key === key ? { ...item, ...patch } : item));
  }

  async function save(nextStatus: 'draft' | 'finalized') {
    
    setError('');
    if (nextStatus === 'finalized' && !items.length) { setError('Add at least one item before finalizing. To keep a blank document, save it as a draft.'); return; }
    if (items.some(i => !i.name_snapshot.trim() || !Number.isFinite(i.quantity) || i.quantity <= 0 || !Number.isFinite(i.rate) || i.rate < 0)) { setError('Check each item: names are required, quantity must be above zero, and rates cannot be negative.'); return; }
    if (Number(discount) < 0 || Number(discount) > subtotal) { setError('Discount must be between ₹0 and the subtotal.'); return; }
    if (Number(taxRate) < 0 || Number(taxRate) > 100) { setError('Tax rate must be between 0% and 100%.'); return; }
    setSaving(true);
    try {
      const payload = {
        id: initial?.id,
        document_type: type,
        status: nextStatus,
        customer_id: customerId || null,
        issue_date: issueDate,
        discount_amount: safeDiscount,
        tax_rate: taxValue,
        notes: notes.trim() || null,
      };
      const payloadItems = items.map(item => ({
        product_id: item.product_id,
        name: item.name_snapshot.trim(),
        sku: item.sku_snapshot,
        unit: item.unit_snapshot,
        quantity: Number(item.quantity),
        rate: Number(item.rate),
      }));
      const { data, error: rpcError } = await localStore.rpc('save_document', { p_document: payload, p_items: payloadItems });
      if (rpcError) throw rpcError;
      const id = typeof data === 'string' ? data : (data as { id?: string })?.id;
      if (!id) throw new Error('Document saved, but the server did not return its ID. Refresh the History page to check it.');
      onSaved(id, nextStatus);
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  }

  const isBill = type === 'bill';
  return <section className="page-section document-editor">
    <div className="page-heading document-heading">
      <button className="button button-ghost" onClick={onCancel}><ArrowLeft size={17} /> Back</button>
      <div><span className="eyebrow">{initial ? 'EDIT DRAFT' : 'NEW DOCUMENT'}</span><h1>{initial ? `Edit ${initial.document_number}` : isBill ? 'Create bill' : 'Create challan'}</h1><p>{isBill ? 'Prepare an invoice for your customer.' : 'Record items being sent or delivered.'}</p></div>
    </div>
    <div className="document-layout">
      <div className="document-main panel">
        <div className="section-title-row"><div className="section-title-icon">{isBill ? <FileText size={18} /> : <Truck size={18} />} </div><div><h2>Document details</h2><p>Choose the customer and date.</p></div></div>
        <div className="form-grid two-col">
          <label>Customer <select value={customerId} onChange={e => setCustomerId(e.target.value)}><option value="">No customer / empty draft</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}</select><span className="field-hint">Need to add someone? Use the Customers section first.</span></label>
          <label>Date<input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} required /></label>
        </div>
        {customer && <div className="customer-summary"><div className="avatar-small">{customer.name.slice(0, 1).toUpperCase()}</div><div><strong>{customer.name}</strong><span>{[customer.phone, customer.address].filter(Boolean).join(' · ') || 'No additional details'}</span></div></div>}
        <div className="section-divider" />
        <div className="section-title-row"><div className="section-title-icon"><Plus size={18} /></div><div><h2>Items</h2><p>Add products from your saved catalogue.</p></div></div>
        <form className="add-product-line" onSubmit={addProduct}>
          <div className="search-wrap"><Search size={16} /><input aria-label="Search products" placeholder="Search product name or SKU" value={productSearch} onChange={e => setProductSearch(e.target.value)} /></div>
          <select aria-label="Choose product" value={chosenProduct} onChange={e => setChosenProduct(e.target.value)}><option value="">Choose a product</option>{filteredProducts.map(p => <option key={p.id} value={p.id}>{p.name} — {money(p.rate)}</option>)}</select>
          <button type="submit" className="button button-secondary" disabled={!chosenProduct}><Plus size={16} /> Add item</button>
        </form>
        {items.length === 0 ? <div className="empty-items"><div className="empty-icon"><FileText size={23} /></div><strong>No items added yet</strong><span>You can save this as a blank draft and finish it later.</span></div> : <div className="items-table-wrap"><table className="data-table item-table"><thead><tr><th>Item</th><th className="right">Qty</th><th className="right">Rate (₹)</th><th className="right">Amount</th><th /></tr></thead><tbody>{items.map(item => <tr key={item.key}><td><strong>{item.name_snapshot}</strong><small>{item.sku_snapshot || item.unit_snapshot || 'Saved product'}</small></td><td><input className="table-input qty-input" aria-label={`Quantity for ${item.name_snapshot}`} type="number" min="0.001" step="any" value={item.quantity} onChange={e => updateItem(item.key, { quantity: Number(e.target.value) })} /></td><td><input className="table-input rate-input" aria-label={`Rate for ${item.name_snapshot}`} type="number" min="0" step="0.01" value={item.rate} onChange={e => updateItem(item.key, { rate: Number(e.target.value) })} /></td><td className="right nowrap">{money(item.quantity * item.rate)}</td><td><button className="icon-button danger-icon" aria-label={`Remove ${item.name_snapshot}`} onClick={() => setItems(prev => prev.filter(i => i.key !== item.key))}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div>}
        <div className="section-divider" />
        <label>Notes (optional)<textarea rows={3} placeholder="Delivery instructions, payment terms, or any note…" value={notes} onChange={e => setNotes(e.target.value)} /></label>
      </div>
      <aside className="document-side">
        <div className="panel totals-panel">
          <span className="eyebrow">SUMMARY</span><h2>Totals</h2>
          <div className="total-row"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
          <label className="compact-field"><span>Discount (₹)</span><input type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} /></label>
          <label className="compact-field"><span>Tax (%)</span><input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={e => setTaxRate(e.target.value)} /><span className="field-hint">Optional — no tax is applied by default.</span></label>
          <div className="total-row"><span>Tax amount</span><strong>{money(taxAmount)}</strong></div>
          <div className="grand-total"><span>Grand total</span><strong>{money(total)}</strong></div>
          <p className="muted tiny">Currency: Indian Rupees (INR)</p>
        </div>
        <div className="panel action-panel">
          <h3>Save document</h3><p>Drafts can be edited later. Finalized documents are locked to protect your records.</p>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <button className="button button-primary button-full" onClick={() => save('finalized')} disabled={saving || status === 'finalized'}>{saving ? <span className="spinner" /> : null}{saving ? 'Saving…' : `Finalize ${isBill ? 'bill' : 'challan'}`}</button>
          <button className="button button-secondary button-full" onClick={() => save('draft')} disabled={saving || status === 'finalized'}>{isBill && items.length === 0 && !customerId ? 'Save Empty Bill Draft' : 'Save as draft'}</button>
          {status === 'finalized' && <div className="alert alert-success">This document is finalized and cannot be changed.</div>}
          <button className="button button-ghost button-full" onClick={onCancel} disabled={saving}>Cancel</button>
        </div>
        {initial && <div className="panel meta-panel"><span className="muted tiny">Document number</span><strong>{initial.document_number}</strong><span className="muted tiny">Created {displayDate(initial.created_at)}</span></div>}
      </aside>
    </div>
  </section>;
}
