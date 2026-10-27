export type DocumentType = 'bill' | 'challan';
export type DocumentStatus = 'draft' | 'finalized';

export interface ShopProfile {
  user_id: string;
  owner_name: string;
  shop_name: string;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  description: string | null;
  rate: number;
  stock_quantity: number | null;
  created_at: string;
}

export interface Customer {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  photo_url: string | null;
  created_at: string;
}

export interface DocumentItem {
  id?: string;
  document_id?: string;
  product_id: string | null;
  name_snapshot: string;
  sku_snapshot: string | null;
  unit_snapshot: string | null;
  quantity: number;
  rate: number;
  line_total: number;
}

export interface ShopSnapshot {
  owner_name: string;
  shop_name: string;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
}

export interface CustomerSnapshot {
  name: string;
  phone: string | null;
  address: string | null;
}

export interface BillingDocument {
  id: string;
  user_id: string;
  document_type: DocumentType;
  document_number: string;
  status: DocumentStatus;
  customer_id: string | null;
  customer_snapshot: CustomerSnapshot | null;
  shop_snapshot: ShopSnapshot;
  issue_date: string;
  subtotal: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  items?: DocumentItem[];
}
