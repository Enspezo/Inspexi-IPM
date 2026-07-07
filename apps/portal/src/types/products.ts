import type { ContactType } from './crm';

// ─── PRD-04: Products & Price Tables Types ─────────────

export enum PriceType {
  FIXED = 'FIXED',
  TIERED = 'TIERED',
}

export interface ProductGroupProduct {
  id: string;
  orgId: string;
  productGroupId: string | null;
  name: string;
  unit: string;
  defaultVat: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ProductGroup {
  id: string;
  orgId: string;
  name: string;
  notes: string | null;
  isDeleted: boolean;
  createdAt: string;
  products?: ProductGroupProduct[];
  _count?: { products: number };
}

export interface Product {
  id: string;
  orgId: string;
  productGroupId: string | null;
  name: string;
  productCode: string | null;
  description: string | null;
  unit: string;
  defaultVat: number;
  isActive: boolean;
  customFields: Record<string, any> | null;
  createdAt: string;
  productGroup?: { id: string; name: string } | null;
}

export interface PriceTable {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  items?: PriceTableItem[];
  contactPriceTables?: { contact: ContactSummary }[];
  _count?: { items: number };
}

export interface ContactSummary {
  id: string;
  type: ContactType;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

export interface PriceTableItem {
  id: string;
  priceTableId: string;
  productId: string;
  priceType: PriceType;
  basePrice: number | null;
  createdAt: string;
  tiers?: PriceTier[];
  product?: Product;
}

export interface PriceTier {
  id: string;
  priceTableItemId: string;
  fromQty: number;
  toQty: number | null;
  price: number;
}
