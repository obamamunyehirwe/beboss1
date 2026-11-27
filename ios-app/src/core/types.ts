export type Role = 'OWNER' | 'MANAGER' | 'CASHIER';

export type Permissions = {
  canSellPOS: boolean;
  canApplyDiscounts: boolean;
  canManageInventory: boolean;
  canViewCostAndProfit: boolean;
  canViewAnalytics: boolean;
  canManageCustomers: boolean;
  canCollectDebt: boolean;
  canDeleteRecords: boolean;
  canExportReports: boolean;
  canManageCollaborators: boolean;
  canManageShopSettings: boolean;
  canExportImportData: boolean;
};

export type ShopProfile = {
  id: number;
  shopName: string;
  ownerName: string;
  username: string;
  phone: string;
  address: string;
  businessType: string;
  currencyCode: string;
  currencySymbol: string;
  taxRate: number;
  receiptHeader: string;
  receiptFooter: string;
  lowStockThresholdDefault: number;
  subscriptionStatus: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
  subscriptionExpiresAt: number;
  trialStartedAt: number;
  deviceCountLimit: number;
  lastSyncedAt: number;
  createdAt: number;
  updatedAt: number;
};

export type Staff = Permissions & {
  id: string;
  name: string;
  username: string;
  phone: string;
  role: Role;
  branchId: string;
  branchName: string;
  pinHash: string;
  passwordHash: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  barcode: string;
  unit: string;
  branchId: string;
  costPrice: number;
  sellingPrice: number;
  quantityInStock: number;
  lowStockThreshold: number;
  isDeleted: boolean;
  syncVersion: number;
  hlcTimestamp: string;
  createdAt: number;
  updatedAt: number;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  taxIdOrNin: string;
  category: string;
  creditLimit: number;
  notes: string;
  debtBalance: number;
  isDeleted: boolean;
  createdAt: number;
  updatedAt: number;
};

export type Branch = {
  id: string;
  name: string;
  code: string;
  locationType: 'STORE' | 'WAREHOUSE';
  address: string;
  phone: string;
  managerName: string;
  isMainBranch: boolean;
  isActive: boolean;
  operationalStatus: 'OPEN' | 'PAUSED' | 'CLOSED';
  notes: string;
  createdAt: number;
  updatedAt: number;
};

export type CartLine = { productId: string; quantity: number; customPrice?: number | null };

export type SaleLine = {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  category: string;
  unit: string;
  quantitySold: number;
  costPriceAtSale: number;
  unitPriceAtSale: number;
  subtotal: number;
  profit: number;
  branchId: string;
};

export type Sale = {
  id: string;
  receiptNumber: string;
  customerId: string | null;
  customerName: string;
  saleDate: number;
  totalAmount: number;
  totalCost: number;
  totalProfit: number;
  discountAmount: number;
  paymentMethod: string;
  paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
  amountPaid: number;
  notes: string;
  branchId: string;
  branchName: string;
  cashierId: string;
  cashierName: string;
  items: SaleLine[];
};

export type CustomerPayment = {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  previousDebt: number;
  remainingDebt: number;
  paymentMethod: string;
  notes: string;
  receiptNumber: string;
  paymentDate: number;
  recordedBy: string;
  branchId: string;
};

export type Purchase = {
  id: string;
  productId: string;
  productName: string;
  supplierName: string;
  supplierPhone: string;
  quantityPurchased: number;
  unitCostPrice: number;
  totalPurchaseCost: number;
  sellingPriceAtPurchase: number;
  paymentStatus: string;
  invoiceNumber: string;
  branchId: string;
  notes: string;
  purchaseDate: number;
};

export type StockTransfer = {
  id: string;
  transferNumber: string;
  productId: string;
  productName: string;
  fromBranchId: string;
  toBranchId: string;
  quantity: number;
  status: 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
  notes: string;
  transferredBy: string;
  receivedBy: string;
  transferDate: number;
  receivedAt: number;
};

export type SyncOutboxItem = {
  id: string;
  tableName: string;
  recordId: string;
  operation: string;
  payloadJson: string;
  status: 'PENDING' | 'FAILED' | 'SYNCED';
  retryCount: number;
  createdAt: number;
  lastError: string;
};

export type StoreSnapshot = {
  profile: ShopProfile | null;
  currentUser: Staff | null;
  products: Product[];
  customers: Customer[];
  branches: Branch[];
  staff: Staff[];
  sales: Sale[];
  payments: CustomerPayment[];
  purchases: Purchase[];
  transfers: StockTransfer[];
  outbox: SyncOutboxItem[];
  totalSales: number;
  totalProfit: number;
  totalDebt: number;
  inventoryCost: number;
  lowStockCount: number;
  pendingSyncCount: number;
};

export type CheckoutInput = {
  items: CartLine[];
  customerId: string | null;
  discountAmount: number;
  amountPaid: number;
  paymentMethod: string;
  notes: string;
  branchId: string;
  enforceCreditLimit?: boolean;
};

export const ROLE_PERMISSIONS: Record<Role, Permissions> = {
  OWNER: {
    canSellPOS: true, canApplyDiscounts: true, canManageInventory: true,
    canViewCostAndProfit: true, canViewAnalytics: true, canManageCustomers: true,
    canCollectDebt: true, canDeleteRecords: true, canExportReports: true,
    canManageCollaborators: true, canManageShopSettings: true, canExportImportData: true
  },
  MANAGER: {
    canSellPOS: true, canApplyDiscounts: true, canManageInventory: true,
    canViewCostAndProfit: true, canViewAnalytics: true, canManageCustomers: true,
    canCollectDebt: true, canDeleteRecords: false, canExportReports: true,
    canManageCollaborators: false, canManageShopSettings: false, canExportImportData: false
  },
  CASHIER: {
    canSellPOS: true, canApplyDiscounts: false, canManageInventory: false,
    canViewCostAndProfit: false, canViewAnalytics: false, canManageCustomers: true,
    canCollectDebt: false, canDeleteRecords: false, canExportReports: false,
    canManageCollaborators: false, canManageShopSettings: false, canExportImportData: false
  }
};
