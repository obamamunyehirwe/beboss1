import type { CloudState, Snapshot } from "./types";

const DAY = 86_400_000;

export function createPreviewCloudState(username = "jean_kigali", phone = "+250788421095"): CloudState {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(9, 15, 0, 0);
  const t0 = todayStart.getTime();

  const products = [
    { id: "prd-01", name: "Inyange Fresh Milk 1L", productName: "Inyange Fresh Milk 1L", sku: "INY-MLK-1L", barcode: "6161100450112", category: "Beverages", costPrice: 1100, sellingPrice: 1500, quantityInStock: 84, lowStockThreshold: 20, unit: "pcs", branchId: "Kigali City Center HQ", updatedAt: now - 3600_000 },
    { id: "prd-02", name: "Azam Wheat Flour 2kg", productName: "Azam Wheat Flour 2kg", sku: "AZM-FLR-2K", barcode: "6201003210045", category: "Groceries", costPrice: 2800, sellingPrice: 3500, quantityInStock: 42, lowStockThreshold: 15, unit: "bag", branchId: "Kigali City Center HQ", updatedAt: now - 7200_000 },
    { id: "prd-03", name: "Bralirwa Primus 50cl Crate", productName: "Bralirwa Primus 50cl Crate", sku: "BRL-PRM-24", barcode: "5410228201120", category: "Beverages", costPrice: 19200, sellingPrice: 23500, quantityInStock: 18, lowStockThreshold: 10, unit: "crate", branchId: "Kigali City Center HQ", updatedAt: now - 5400_000 },
    { id: "prd-04", name: "Movit Shea Body Lotion 400ml", productName: "Movit Shea Body Lotion 400ml", sku: "MVT-LTN-400", barcode: "6164001209874", category: "Personal Care", costPrice: 3200, sellingPrice: 4500, quantityInStock: 7, lowStockThreshold: 10, unit: "btl", branchId: "Remera Gisimenti Branch", updatedAt: now - 1800_000 },
    { id: "prd-05", name: "Rwanda Bourbon Coffee 500g", productName: "Rwanda Bourbon Coffee 500g", sku: "RWB-COF-500", barcode: "6161109981231", category: "Hot Drinks", costPrice: 6500, sellingPrice: 9200, quantityInStock: 31, lowStockThreshold: 10, unit: "pack", branchId: "Kigali City Center HQ", updatedAt: now - 4200_000 },
    { id: "prd-06", name: "Golden Fry Cooking Oil 5L", productName: "Golden Fry Cooking Oil 5L", sku: "GDF-OIL-5L", barcode: "6161100884321", category: "Groceries", costPrice: 11800, sellingPrice: 14500, quantityInStock: 5, lowStockThreshold: 8, unit: "jerrican", branchId: "Remera Gisimenti Branch", updatedAt: now - 9000_000 },
    { id: "prd-07", name: "Omo Multi-Active Detergent 1kg", productName: "Omo Multi-Active Detergent 1kg", sku: "OMO-DET-1K", barcode: "6001087342100", category: "Household", costPrice: 2900, sellingPrice: 3800, quantityInStock: 56, lowStockThreshold: 15, unit: "pack", branchId: "Kigali City Center HQ", updatedAt: now - 10800_000 },
    { id: "prd-08", name: "MTN Airtime Voucher 5,000", productName: "MTN Airtime Voucher 5,000", sku: "MTN-AIR-5K", barcode: "2507880050001", category: "Digital", costPrice: 4850, sellingPrice: 5000, quantityInStock: 120, lowStockThreshold: 25, unit: "voucher", branchId: "Kigali City Center HQ", updatedAt: now - 1200_000 },
    { id: "prd-09", name: "Basmati Long Grain Rice 5kg", productName: "Basmati Long Grain Rice 5kg", sku: "BSM-RIC-5K", barcode: "8901234509123", category: "Groceries", costPrice: 8200, sellingPrice: 10500, quantityInStock: 4, lowStockThreshold: 10, unit: "bag", branchId: "Nyamirambo Express Depot", updatedAt: now - 2600_000 },
    { id: "prd-10", name: "Sina Gerard Akabanga Oil 100ml", productName: "Sina Gerard Akabanga Oil 100ml", sku: "SIN-AKB-100", barcode: "6161107723410", category: "Condiments", costPrice: 1800, sellingPrice: 2600, quantityInStock: 49, lowStockThreshold: 12, unit: "btl", branchId: "Kigali City Center HQ", updatedAt: now - 6400_000 },
    { id: "prd-11", name: "Colgate Herbal Toothpaste 100ml", productName: "Colgate Herbal Toothpaste 100ml", sku: "CLG-HRB-100", barcode: "6001067025412", category: "Personal Care", costPrice: 1450, sellingPrice: 2100, quantityInStock: 38, lowStockThreshold: 12, unit: "tube", branchId: "Remera Gisimenti Branch", updatedAt: now - 8200_000 },
    { id: "prd-12", name: "Skol Malt 50cl Pack (12)", productName: "Skol Malt 50cl Pack (12)", sku: "SKL-MLT-12", barcode: "5410228209911", category: "Beverages", costPrice: 10200, sellingPrice: 12800, quantityInStock: 26, lowStockThreshold: 8, unit: "pack", branchId: "Nyamirambo Express Depot", updatedAt: now - 3100_000 },
  ];

  const customers = [
    { id: "cus-01", name: "Nadia Uwimana", phone: "+250788310442", email: "nadia@kigalicafe.rw", creditLimit: 250000, debtBalance: 64500, notes: "Regular café wholesale buyer", updatedAt: now - 3600_000 },
    { id: "cus-02", name: "Eric Mugisha", phone: "+250788502190", email: "eric.m@remeralodge.rw", creditLimit: 400000, debtBalance: 118000, notes: "Weekly lodge restock", updatedAt: now - 8400_000 },
    { id: "cus-03", name: "Claudine Mukamana", phone: "+250783901122", email: "claudine@bistronyamirambo.rw", creditLimit: 150000, debtBalance: 0, notes: "Always pays via MTN MoMo", updatedAt: now - 14400_000 },
    { id: "cus-04", name: "Patrick Habimana", phone: "+250789114500", email: "patrick@kigalisupply.rw", creditLimit: 300000, debtBalance: 42000, notes: "Net-14 account", updatedAt: now - 21600_000 },
    { id: "cus-05", name: "Diane Ingabire", phone: "+250782644318", email: "diane.ingabire@gmail.com", creditLimit: 80000, debtBalance: 0, notes: "VIP retail shopper", updatedAt: now - 43200_000 },
  ];

  const sales = [
    { id: "sal-01", receiptNumber: "BB-2026-1048", saleDate: t0 + 3600_000 * 1.2, customerId: "cus-01", customerName: "Nadia Uwimana", cashierName: "Aline Uwase", paymentMethod: "MOMO", paymentStatus: "PAID", totalAmount: 68400, amountPaid: 68400, discountAmount: 0, totalProfit: 16800, branchId: "br-hq" },
    { id: "sal-02", receiptNumber: "BB-2026-1047", saleDate: t0 + 3600_000 * 0.5, customerId: "", customerName: "Walk-in", cashierName: "Aline Uwase", paymentMethod: "CASH", paymentStatus: "PAID", totalAmount: 38500, amountPaid: 38500, discountAmount: 500, totalProfit: 9400, branchId: "br-hq" },
    { id: "sal-03", receiptNumber: "BB-2026-1046", saleDate: t0 - 1200_000, customerId: "cus-02", customerName: "Eric Mugisha", cashierName: "David Niyonzima", paymentMethod: "CREDIT", paymentStatus: "PARTIAL", totalAmount: 94000, amountPaid: 40000, discountAmount: 0, totalProfit: 22100, branchId: "br-remera" },
    { id: "sal-04", receiptNumber: "BB-2026-1045", saleDate: now - DAY * 1, customerId: "cus-03", customerName: "Claudine Mukamana", cashierName: "Aline Uwase", paymentMethod: "MOMO", paymentStatus: "PAID", totalAmount: 142500, amountPaid: 142500, discountAmount: 2500, totalProfit: 34200, branchId: "br-hq" },
    { id: "sal-05", receiptNumber: "BB-2026-1044", saleDate: now - DAY * 2, customerId: "", customerName: "Walk-in", cashierName: "David Niyonzima", paymentMethod: "CASH", paymentStatus: "PAID", totalAmount: 118000, amountPaid: 118000, discountAmount: 0, totalProfit: 27900, branchId: "br-remera" },
    { id: "sal-06", receiptNumber: "BB-2026-1043", saleDate: now - DAY * 3, customerId: "cus-04", customerName: "Patrick Habimana", cashierName: "Aline Uwase", paymentMethod: "BANK", paymentStatus: "PAID", totalAmount: 186000, amountPaid: 186000, discountAmount: 0, totalProfit: 44800, branchId: "br-hq" },
    { id: "sal-07", receiptNumber: "BB-2026-1042", saleDate: now - DAY * 4, customerId: "", customerName: "Walk-in", cashierName: "Grace Mukeshimana", paymentMethod: "CASH", paymentStatus: "PAID", totalAmount: 96400, amountPaid: 96400, discountAmount: 0, totalProfit: 23100, branchId: "br-nyam" },
    { id: "sal-08", receiptNumber: "BB-2026-1041", saleDate: now - DAY * 5, customerId: "cus-05", customerName: "Diane Ingabire", cashierName: "Aline Uwase", paymentMethod: "MOMO", paymentStatus: "PAID", totalAmount: 129000, amountPaid: 129000, discountAmount: 1000, totalProfit: 31400, branchId: "br-hq" },
    { id: "sal-09", receiptNumber: "BB-2026-1040", saleDate: now - DAY * 6, customerId: "", customerName: "Walk-in", cashierName: "David Niyonzima", paymentMethod: "CASH", paymentStatus: "PAID", totalAmount: 154200, amountPaid: 154200, discountAmount: 0, totalProfit: 38600, branchId: "br-remera" },
  ];

  const saleItems = [
    { id: "si-01", saleId: "sal-01", productId: "prd-05", productName: "Rwanda Bourbon Coffee 500g", quantitySold: 4, unitPriceAtSale: 9200, costPriceAtSale: 6500, subtotal: 36800 },
    { id: "si-02", saleId: "sal-01", productId: "prd-01", productName: "Inyange Fresh Milk 1L", quantitySold: 12, unitPriceAtSale: 1500, costPriceAtSale: 1100, subtotal: 18000 },
    { id: "si-03", saleId: "sal-01", productId: "prd-10", productName: "Sina Gerard Akabanga Oil 100ml", quantitySold: 5, unitPriceAtSale: 2600, costPriceAtSale: 1800, subtotal: 13000 },
    { id: "si-04", saleId: "sal-02", productId: "prd-03", productName: "Bralirwa Primus 50cl Crate", quantitySold: 1, unitPriceAtSale: 23500, costPriceAtSale: 19200, subtotal: 23500 },
    { id: "si-05", saleId: "sal-02", productId: "prd-01", productName: "Inyange Fresh Milk 1L", quantitySold: 10, unitPriceAtSale: 1500, costPriceAtSale: 1100, subtotal: 15000 },
    { id: "si-06", saleId: "sal-03", productId: "prd-03", productName: "Bralirwa Primus 50cl Crate", quantitySold: 4, unitPriceAtSale: 23500, costPriceAtSale: 19200, subtotal: 94000 },
    { id: "si-07", saleId: "sal-04", productId: "prd-02", productName: "Azam Wheat Flour 2kg", quantitySold: 15, unitPriceAtSale: 3500, costPriceAtSale: 2800, subtotal: 52500 },
    { id: "si-08", saleId: "sal-04", productId: "prd-06", productName: "Golden Fry Cooking Oil 5L", quantitySold: 6, unitPriceAtSale: 14500, costPriceAtSale: 11800, subtotal: 87000 },
    { id: "si-09", saleId: "sal-05", productId: "prd-07", productName: "Omo Multi-Active Detergent 1kg", quantitySold: 18, unitPriceAtSale: 3800, costPriceAtSale: 2900, subtotal: 68400 },
    { id: "si-10", saleId: "sal-06", productId: "prd-09", productName: "Basmati Long Grain Rice 5kg", quantitySold: 12, unitPriceAtSale: 10500, costPriceAtSale: 8200, subtotal: 126000 },
  ];

  const purchases = [
    { id: "pur-01", supplierName: "Inyange Industries Ltd", purchaseDate: now - DAY * 1, totalCost: 264000, paymentStatus: "PAID_BANK", reference: "INV-INY-8821", notes: "Weekly dairy delivery" },
    { id: "pur-02", supplierName: "Bralirwa Distribution Kigali", purchaseDate: now - DAY * 2, totalCost: 480000, paymentStatus: "PAID_MOMO", reference: "INV-BRL-4410", notes: "Beverage crates restock" },
    { id: "pur-03", supplierName: "Bakhresa Grain Milling", purchaseDate: now - DAY * 4, totalCost: 312000, paymentStatus: "SUPPLIER_CREDIT", reference: "INV-AZM-1192", notes: "Flour & cooking oil pallet" },
    { id: "pur-04", supplierName: "Rwanda Farmers Coffee Co.", purchaseDate: now - DAY * 6, totalCost: 195000, paymentStatus: "PAID_CASH", reference: "INV-RFC-0094", notes: "Roasted Bourbon 500g packs" },
  ];

  const branches = [
    { id: "br-hq", name: "Kigali City Center HQ", code: "KGL-HQ", address: "KN 4 Ave, Nyarugenge, Kigali", phone: "+250788421095", is_active: true, is_main: true, daily_target: 450000 },
    { id: "br-remera", name: "Remera Gisimenti Branch", code: "KGL-RMR", address: "KG 11 Ave, Remera, Kigali", phone: "+250788421096", is_active: true, is_main: false, daily_target: 320000 },
    { id: "br-nyam", name: "Nyamirambo Express Depot", code: "KGL-NYM", address: "KN 2 Ave, Nyamirambo, Kigali", phone: "+250788421097", is_active: true, is_main: false, daily_target: 240000 },
  ];

  const staff = [
    { user_id: "usr-01", full_name: "Jean Bosco Nshimiyimana", username: username, role: "OWNER", assigned_branch_id: "br-hq", assigned_branch_name: "Kigali City Center HQ", is_active: true, phone: phone },
    { user_id: "usr-02", full_name: "Aline Uwase", username: "aline_pos", role: "MANAGER", assigned_branch_id: "br-hq", assigned_branch_name: "Kigali City Center HQ", is_active: true, phone: "+250788651200" },
    { user_id: "usr-03", full_name: "David Niyonzima", username: "david_remera", role: "CASHIER", assigned_branch_id: "br-remera", assigned_branch_name: "Remera Gisimenti Branch", is_active: true, phone: "+250783440199" },
    { user_id: "usr-04", full_name: "Grace Mukeshimana", username: "grace_nyam", role: "CASHIER", assigned_branch_id: "br-nyam", assigned_branch_name: "Nyamirambo Express Depot", is_active: true, phone: "+250789301844" },
  ];

  const users = staff.map((st) => ({
    id: st.user_id,
    fullName: st.full_name,
    username: st.username,
    role: st.role,
    assignedBranchId: st.assigned_branch_id,
    isActive: st.is_active,
    canSell: true,
    canViewReports: st.role !== "CASHIER",
    canEditProducts: st.role !== "CASHIER",
    canManageCustomers: true,
    canManagePurchases: st.role !== "CASHIER",
    canGiveDiscount: st.role !== "CASHIER",
    updatedAt: now - 3600_000,
  }));

  const devices = [
    { id: "dev-01", device_name: "HQ Counter · Sunmi V2 Pro", platform: "Android POS", branch_name: "Kigali City Center HQ", is_active: true, last_seen_at: now - 180_000, app_version: "2.4.1" },
    { id: "dev-02", device_name: "Remera Till #1 · Samsung Tab", platform: "Android POS", branch_name: "Remera Gisimenti Branch", is_active: true, last_seen_at: now - 920_000, app_version: "2.4.1" },
    { id: "dev-03", device_name: "Owner Command Workstation", platform: "BeBoss Desktop 1.3.0", branch_name: "Kigali City Center HQ", is_active: true, last_seen_at: now - 12_000, app_version: "1.3.0" },
  ];

  const transfers = [
    { id: "trf-01", reference: "TRF-2026-089", from_branch_id: "br-hq", from_branch_name: "Kigali City Center HQ", to_branch_id: "br-remera", to_branch_name: "Remera Gisimenti Branch", product_name: "Inyange Fresh Milk 1L", quantity: 30, status: "IN_TRANSIT", created_at: now - 7200_000 },
    { id: "trf-02", reference: "TRF-2026-088", from_branch_id: "br-hq", from_branch_name: "Kigali City Center HQ", to_branch_id: "br-nyam", to_branch_name: "Nyamirambo Express Depot", product_name: "Golden Fry Cooking Oil 5L", quantity: 10, status: "REQUESTED", created_at: now - 14400_000 },
    { id: "trf-03", reference: "TRF-2026-087", from_branch_id: "br-remera", from_branch_name: "Remera Gisimenti Branch", to_branch_id: "br-hq", to_branch_name: "Kigali City Center HQ", product_name: "Rwanda Bourbon Coffee 500g", quantity: 12, status: "COMPLETED", created_at: now - DAY * 1 },
  ];

  const snapshot: Snapshot = {
    metadata: { version: 14, schemaVersion: "2.4", lastSyncedBy: "DESKTOP", syncedAt: now - 120_000 },
    shopProfile: {
      shopName: "Kigali Prime Mart",
      name: "Jean Bosco Nshimiyimana",
      address: "KN 4 Ave, Nyarugenge, Kigali, Rwanda",
      phone: phone,
      email: "owner@kigaliprimemart.rw",
      tinNumber: "104829310",
      currencySymbol: "FRw",
      taxRate: 18,
      receiptHeader: "Thank you for shopping at Kigali Prime Mart",
      receiptFooter: "Goods sold in good condition are non-refundable · Powered by BeBoss",
      subscriptionStatus: "ACTIVE",
      subscriptionExpiresAt: now + DAY * 42,
    },
    products,
    customers,
    sales,
    saleItems,
    customerPayments: [
      { id: "cp-01", customerId: "cus-01", customerName: "Nadia Uwimana", amount: 50000, paymentMethod: "MOMO", paymentDate: now - DAY * 1 },
      { id: "cp-02", customerId: "cus-02", customerName: "Eric Mugisha", amount: 75000, paymentMethod: "BANK", paymentDate: now - DAY * 2 },
    ],
    purchases,
    stockTransfers: transfers,
    branches,
    users,
    tombstones: [],
  };

  return {
    shop: {
      id: "shop-kpm-001",
      shop_name: "Kigali Prime Mart",
      owner_name: "Jean Bosco Nshimiyimana",
      owner_phone: phone,
      subscription_plan: "PRO_MULTI_BRANCH",
      subscription_status: "ACTIVE",
      subscription_expires_at: now + DAY * 42,
      created_at: now - DAY * 210,
    },
    owner: {
      username,
      owner_name: "Jean Bosco Nshimiyimana",
      phone,
      verified: true,
      last_verified_at: now - 300_000,
    },
    snapshot,
    snapshotUpdatedAt: now - 120_000,
    verifiedChunks: 12,
    payments: [
      { id: "pay-01", amount: 45000, currency: "FRw", plan: "PRO_MULTI_BRANCH", provider: "MTN_MOMO", status: "APPROVED", created_at: now - DAY * 18, reference: "MOMO-8841209" },
      { id: "pay-02", amount: 45000, currency: "FRw", plan: "PRO_MULTI_BRANCH", provider: "MTN_MOMO", status: "APPROVED", created_at: now - DAY * 48, reference: "MOMO-7730184" },
    ],
    codes: [
      { id: "code-01", code: "BB-PAIR-7492", branch_name: "Remera Gisimenti Branch", status: "ACTIVE", expires_at: now + DAY * 2 },
    ],
    devices,
    branches,
    transfers,
    staff,
    announcements: [
      { id: "ann-01", title: "BeBoss Desktop 1.3.0 Ready", body: "Signed SQLCipher snapshots, ESC/POS thermal receipts, and multi-branch transfer reconciliation are active.", created_at: now - DAY * 2 },
    ],
    serverTime: now,
  };
}