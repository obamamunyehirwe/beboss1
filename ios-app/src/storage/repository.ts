import { execute, first, getDatabase, query, transaction } from './database';
import {
  centsToMoney, hashCredential, isSubscriptionActive, makeId, multiplyPriceQuantityCents,
  nowHlc, roundMoney, tickHlc, toCents, validatePassword, validatePin, verifyCredential
} from '../core/domain';
import {
  Branch, CartLine, CheckoutInput, Customer, CustomerPayment, Permissions, Product, Purchase,
  Role, Sale, SaleLine, ShopProfile, Staff, StockTransfer, StoreSnapshot, SyncOutboxItem,
  ROLE_PERMISSIONS
} from '../core/types';

type Row = Record<string, any>;
const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DAYS = 4;

function fromJson<T>(value: string): T {
  return JSON.parse(value) as T;
}
function toJson(value: unknown): string {
  return JSON.stringify(value);
}
function requirePermission(user: Staff | null, permission: keyof Permissions, label: string): void {
  if (!user || !user.isActive || !user[permission]) {
    throw new Error('Access denied: your account cannot ' + label + '.');
  }
}
function assertAmount(value: number, label: string, allowZero = true): number {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(label + ' must be a valid ' + (allowZero ? 'non-negative' : 'positive') + ' amount.');
  }
  return roundMoney(value);
}
function productFromRow(row: Row): Product {
  return fromJson<Product>(row.data);
}
function customerFromRow(row: Row): Customer {
  return fromJson<Customer>(row.data);
}
function staffFromRow(row: Row): Staff {
  return fromJson<Staff>(row.data);
}
function branchFromRow(row: Row): Branch {
  return fromJson<Branch>(row.data);
}
function saleFromRow(row: Row): Sale {
  return fromJson<Sale>(row.data);
}
function profileFromRow(row: Row): ShopProfile {
  return fromJson<ShopProfile>(row.data);
}
function outboxFromRow(row: Row): SyncOutboxItem {
  return {
    id: row.id,
    tableName: row.table_name,
    recordId: row.record_id,
    operation: row.operation,
    payloadJson: row.payload_json,
    status: row.status,
    retryCount: row.retry_count,
    createdAt: row.created_at,
    lastError: row.last_error
  };
}

async function audit(actor: Staff | null, action: string, targetId = '', details = '', tx?: any): Promise<void> {
  const now = Date.now();
  await execute(
    'INSERT INTO audit_logs(id,actor_id,actor_name,action,target_id,details,created_at) VALUES(?,?,?,?,?,?,?)',
    [makeId(), actor?.id || '', actor?.name || 'System', action, targetId, details.slice(0, 2000), now],
    tx
  );
}
async function enqueue(tableName: string, recordId: string, operation: string, payload: unknown, tx: any): Promise<void> {
  const now = Date.now();
  await execute(
    'INSERT INTO sync_outbox(id,table_name,record_id,operation,payload_json,status,retry_count,last_error,created_at,updated_at) VALUES(?,?,?,?,?,"PENDING",0,"",?,?)',
    [makeId(), tableName, recordId, operation, toJson(payload), now, now],
    tx
  );
}
async function saveProductRow(product: Product, tx: any): Promise<void> {
  await execute(
    'INSERT INTO products(id,name,barcode,category,branch_id,price_cents,cost_cents,stock,deleted,data,created_at,updated_at,version,hlc) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,barcode=excluded.barcode,category=excluded.category,branch_id=excluded.branch_id,price_cents=excluded.price_cents,cost_cents=excluded.cost_cents,stock=excluded.stock,deleted=excluded.deleted,data=excluded.data,updated_at=excluded.updated_at,version=excluded.version,hlc=excluded.hlc',
    [product.id, product.name, product.barcode, product.category, product.branchId, toCents(product.sellingPrice), toCents(product.costPrice), product.quantityInStock, product.isDeleted ? 1 : 0, toJson(product), product.createdAt, product.updatedAt, product.syncVersion, product.hlcTimestamp],
    tx
  );
}
async function saveCustomerRow(customer: Customer, tx: any): Promise<void> {
  await execute(
    'INSERT INTO customers(id,name,phone,debt_cents,deleted,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone,debt_cents=excluded.debt_cents,deleted=excluded.deleted,data=excluded.data,updated_at=excluded.updated_at',
    [customer.id, customer.name, customer.phone, toCents(customer.debtBalance), customer.isDeleted ? 1 : 0, toJson(customer), customer.createdAt, customer.updatedAt],
    tx
  );
}
async function saveBranchRow(branch: Branch, tx: any): Promise<void> {
  await execute(
    'INSERT INTO branches(id,name,active,data,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active,data=excluded.data,updated_at=excluded.updated_at',
    [branch.id, branch.name, branch.isActive ? 1 : 0, toJson(branch), branch.createdAt, branch.updatedAt],
    tx
  );
}
async function currentProfile(): Promise<ShopProfile | null> {
  const row = await first<Row>('SELECT data FROM shop_profile WHERE id=1');
  return row ? profileFromRow(row) : null;
}
async function currentStaff(userId: string): Promise<Staff | null> {
  if (!userId) return null;
  const row = await first<Row>('SELECT data FROM users WHERE id=? AND active=1', [userId]);
  return row ? staffFromRow(row) : null;
}

export async function initializeStore(): Promise<void> {
  await getDatabase();
}

export async function loadSnapshot(userId: string | null): Promise<StoreSnapshot> {
  const profile = await currentProfile();
  const user = userId ? await currentStaff(userId) : null;
  const productRows = await query<Row>('SELECT data FROM products WHERE deleted=0 ORDER BY name COLLATE NOCASE');
  const customerRows = await query<Row>('SELECT data FROM customers WHERE deleted=0 ORDER BY name COLLATE NOCASE');
  const branchRows = await query<Row>('SELECT data FROM branches ORDER BY name COLLATE NOCASE');
  const staffRows = await query<Row>('SELECT data FROM users ORDER BY name COLLATE NOCASE');
  const saleRows = await query<Row>('SELECT data FROM sales ORDER BY created_at DESC LIMIT 500');
  const paymentRows = await query<Row>('SELECT data FROM customer_payments ORDER BY created_at DESC LIMIT 500');
  const purchaseRows = await query<Row>('SELECT data FROM purchases ORDER BY created_at DESC LIMIT 500');
  const transferRows = await query<Row>('SELECT data FROM stock_transfers ORDER BY created_at DESC LIMIT 500');
  const outboxRows = await query<Row>('SELECT * FROM sync_outbox WHERE status != "SYNCED" ORDER BY created_at');
  const products = productRows.map(row => productFromRow(row));
  const customers = customerRows.map(row => customerFromRow(row));
  const sales = saleRows.map(row => saleFromRow(row));
  const purchases = purchaseRows.map(row => fromJson<Purchase>(row.data));
  const transfers = transferRows.map(row => fromJson<StockTransfer>(row.data));
  return {
    profile,
    currentUser: user,
    products,
    customers,
    branches: branchRows.map(row => branchFromRow(row)),
    staff: staffRows.map(row => staffFromRow(row)),
    sales,
    payments: paymentRows.map(row => fromJson<CustomerPayment>(row.data)),
    purchases,
    transfers,
    outbox: outboxRows.map(row => outboxFromRow(row)),
    totalSales: sales.reduce((total, sale) => total + sale.totalAmount, 0),
    totalProfit: sales.reduce((total, sale) => total + sale.totalProfit, 0),
    totalDebt: customers.reduce((total, customer) => total + customer.debtBalance, 0),
    inventoryCost: products.reduce((total, product) => total + product.costPrice * product.quantityInStock, 0),
    lowStockCount: products.filter(product => product.quantityInStock <= product.lowStockThreshold).length,
    pendingSyncCount: outboxRows.length
  };
}

export async function registerOwner(input: {
  shopName: string; ownerName: string; username: string; phone: string; pin: string;
  password: string; address: string; businessType: string; currencyCode: string; currencySymbol: string;
}): Promise<Staff> {
  if (await currentProfile()) throw new Error('A shop is already registered on this iPhone. Use staff sign-in or the secure pairing process.');
  if (!input.shopName.trim() || !input.ownerName.trim()) throw new Error('Shop name and owner name are required.');
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,80}$/.test(username)) throw new Error('Username must use 2 to 80 letters, numbers, dots, underscores or hyphens.');
  const phoneDigits = input.phone.replace(/[^0-9]/g, '').slice(-9);
  if (!/^[0-9]{9}$/.test(phoneDigits)) throw new Error('Enter the registered 9-digit Rwanda phone number.');
  const pinIssue = validatePin(input.pin);
  if (pinIssue) throw new Error(pinIssue);
  const passwordIssue = validatePassword(input.password);
  if (passwordIssue) throw new Error(passwordIssue);
  const now = Date.now();
  const profile: ShopProfile = {
    id: 1, shopName: input.shopName.trim(), ownerName: input.ownerName.trim(), username, phone: input.phone.trim(),
    address: input.address.trim(), businessType: input.businessType.trim() || 'sector_retail',
    currencyCode: input.currencyCode.trim().toUpperCase() || 'RWF',
    currencySymbol: input.currencySymbol.trim() || 'RWF', taxRate: 0, receiptHeader: '',
    receiptFooter: 'Thank you for your business!', lowStockThresholdDefault: 5,
    subscriptionStatus: 'TRIAL', subscriptionExpiresAt: now + TRIAL_DAYS * DAY_MS,
    trialStartedAt: now, deviceCountLimit: 1, lastSyncedAt: 0, createdAt: now, updatedAt: now
  };
  const owner: Staff = {
    id: makeId(), name: input.ownerName.trim(), username, phone: input.phone.trim(), role: 'OWNER',
    branchId: '', branchName: 'All Branches', pinHash: hashCredential(input.pin),
    passwordHash: hashCredential(input.password), isActive: true, createdAt: now, updatedAt: now, lastLoginAt: now,
    ...ROLE_PERMISSIONS.OWNER
  };
  const mainBranch: Branch = {
    id: 'main_branch', name: input.shopName.trim() + ' (HQ)', code: 'HQ-01', locationType: 'STORE',
    address: profile.address, phone: profile.phone, managerName: profile.ownerName, isMainBranch: true,
    isActive: true, operationalStatus: 'OPEN', notes: '', createdAt: now, updatedAt: now
  };
  await transaction(async tx => {
    await execute('INSERT INTO shop_profile(id,data,updated_at) VALUES(1,?,?)', [toJson(profile), now], tx);
    await execute('INSERT INTO users(id,username,role,branch_id,active,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
      [owner.id, owner.username, owner.role, owner.branchId, 1, toJson(owner), now, now], tx);
    await saveBranchRow(mainBranch, tx);
    await enqueue('shop_profile', '1', 'CREATE', profile, tx);
    await enqueue('users', owner.id, 'CREATE', { ...owner, pinHash: '', passwordHash: '' }, tx);
    await enqueue('branches', mainBranch.id, 'CREATE', mainBranch, tx);
    await audit(owner, 'SHOP_REGISTERED', owner.username, 'Created the shop workspace on iPhone.', tx);
  });
  return owner;
}

export async function authenticate(usernameInput: string, secret: string): Promise<Staff> {
  const username = usernameInput.trim().toLowerCase();
  const staff = username
    ? await first<Row>('SELECT data FROM users WHERE username=? COLLATE NOCASE AND active=1', [username])
    : await first<Row>('SELECT data FROM users WHERE role="OWNER" AND active=1 ORDER BY created_at LIMIT 1');
  if (!staff) throw new Error('No active staff account matches those details.');
  const user = staffFromRow(staff);
  const bucket = 'login:' + user.id;
  const attempt = await first<Row>('SELECT failures,blocked_until FROM auth_attempts WHERE bucket=?', [bucket]);
  if (attempt && attempt.blocked_until > Date.now()) {
    const seconds = Math.ceil((attempt.blocked_until - Date.now()) / 1000);
    throw new Error('Too many failed attempts. Try again in ' + seconds + ' seconds.');
  }
  const pinValid = verifyCredential(secret, user.pinHash);
  const passwordValid = verifyCredential(secret, user.passwordHash);
  if (!pinValid && !passwordValid) {
    if (user.pinHash.startsWith('pbkdf2:') || user.passwordHash.startsWith('pbkdf2:')) {
      throw new Error('This staff account uses an Android-only legacy credential. Sign in on the enrolled Android terminal and complete its secure credential upgrade, or use the BeBoss owner verification and iPhone pairing flow. The old pepper is not copied to iOS.');
    }
    const failures = (attempt?.failures || 0) + 1;
    const blockedUntil = failures >= 5 ? Date.now() + Math.min(30 * 60 * 1000, (2 ** (failures - 5)) * 60 * 1000) : 0;
    await execute('INSERT INTO auth_attempts(bucket,failures,blocked_until,updated_at) VALUES(?,?,?,?) ON CONFLICT(bucket) DO UPDATE SET failures=excluded.failures,blocked_until=excluded.blocked_until,updated_at=excluded.updated_at',
      [bucket, failures, blockedUntil, Date.now()]);
    throw new Error('Incorrect PIN or password.');
  }
  await execute('DELETE FROM auth_attempts WHERE bucket=?', [bucket]);
  user.lastLoginAt = Date.now();
  user.updatedAt = Date.now();
  await execute('UPDATE users SET data=?,updated_at=? WHERE id=?', [toJson(user), user.updatedAt, user.id]);
  await audit(user, 'LOGIN_SUCCESS', user.username, 'Staff signed in on the iPhone.');
  return user;
}

export async function saveProduct(input: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'syncVersion' | 'hlcTimestamp' | 'isDeleted'> & { id?: string }, actor: Staff): Promise<Product> {
  requirePermission(actor, 'canManageInventory', 'manage inventory');
  if (!input.name.trim()) throw new Error('Product name is required.');
  assertAmount(input.sellingPrice, 'Selling price');
  assertAmount(input.costPrice, 'Cost price');
  assertAmount(input.quantityInStock, 'Opening stock');
  assertAmount(input.lowStockThreshold, 'Low-stock threshold');
  const existingRow = input.id ? await first<Row>('SELECT data FROM products WHERE id=?', [input.id]) : null;
  const existing = existingRow ? productFromRow(existingRow) : null;
  const now = Date.now();
  const product: Product = {
    id: input.id || makeId(), name: input.name.trim(), category: input.category.trim() || 'General',
    barcode: input.barcode.trim(), unit: input.unit.trim() || 'pcs',
    branchId: input.branchId || actor.branchId || 'main_branch', costPrice: roundMoney(input.costPrice),
    sellingPrice: roundMoney(input.sellingPrice), quantityInStock: input.quantityInStock,
    lowStockThreshold: input.lowStockThreshold, isDeleted: false,
    syncVersion: (existing?.syncVersion || 0) + 1, hlcTimestamp: tickHlc(existing?.hlcTimestamp || '0', now),
    createdAt: existing?.createdAt || now, updatedAt: now
  };
  await transaction(async tx => {
    await saveProductRow(product, tx);
    await execute('DELETE FROM sync_tombstones WHERE id=?', ['products:' + product.id], tx);
    await enqueue('products', product.id, existing ? 'UPDATE' : 'CREATE', product, tx);
    await audit(actor, existing ? 'PRODUCT_UPDATED' : 'PRODUCT_CREATED', product.id, product.name, tx);
  });
  return product;
}

export async function adjustStock(productId: string, delta: number, reason: string, actor: Staff): Promise<Product> {
  requirePermission(actor, 'canManageInventory', 'adjust stock');
  if (!Number.isFinite(delta) || delta === 0) throw new Error('Enter a non-zero quantity change.');
  if (!reason.trim()) throw new Error('A stock adjustment reason is required.');
  return transaction(async tx => {
    const row = await first<Row>('SELECT data FROM products WHERE id=? AND deleted=0', [productId], tx);
    if (!row) throw new Error('Product not found.');
    const product = productFromRow(row);
    const next = product.quantityInStock + delta;
    if (next < 0) throw new Error('This adjustment would make stock negative.');
    product.quantityInStock = next;
    product.updatedAt = Date.now();
    product.syncVersion += 1;
    product.hlcTimestamp = tickHlc(product.hlcTimestamp, product.updatedAt);
    await saveProductRow(product, tx);
    await enqueue('products', product.id, 'UPDATE', { id: product.id, stockAdjustment: delta, newStock: next, reason: reason.trim(), updatedAt: product.updatedAt }, tx);
    await audit(actor, 'STOCK_ADJUSTED', product.id, delta + ' ' + product.unit + ': ' + reason.trim(), tx);
    return product;
  });
}

export async function deleteProduct(productId: string, actor: Staff): Promise<void> {
  requirePermission(actor, 'canDeleteRecords', 'delete products');
  requirePermission(actor, 'canManageInventory', 'manage inventory');
  await transaction(async tx => {
    const row = await first<Row>('SELECT data FROM products WHERE id=? AND deleted=0', [productId], tx);
    if (!row) throw new Error('Product not found.');
    const product = productFromRow(row);
    product.isDeleted = true;
    product.updatedAt = Date.now();
    product.syncVersion += 1;
    product.hlcTimestamp = tickHlc(product.hlcTimestamp, product.updatedAt);
    await saveProductRow(product, tx);
    await execute('INSERT OR REPLACE INTO sync_tombstones(id,table_name,record_id,deleted_at,hlc) VALUES(?,?,?,?,?)',
      ['products:' + product.id, 'products', product.id, product.updatedAt, product.hlcTimestamp], tx);
    await enqueue('products', product.id, 'DELETE', { id: product.id }, tx);
    await audit(actor, 'PRODUCT_SOFT_DELETED', product.id, product.name, tx);
  });
}

export async function saveCustomer(input: Partial<Customer> & { name: string }, actor: Staff): Promise<Customer> {
  requirePermission(actor, 'canManageCustomers', 'manage customers');
  if (!input.name.trim()) throw new Error('Customer name is required.');
  const id = input.id || makeId();
  const row = await first<Row>('SELECT data FROM customers WHERE id=?', [id]);
  const existing = row ? customerFromRow(row) : null;
  const now = Date.now();
  const customer: Customer = {
    id, name: input.name.trim(), phone: (input.phone || '').trim(), email: (input.email || '').trim(),
    address: (input.address || '').trim(), city: (input.city || '').trim(), taxIdOrNin: (input.taxIdOrNin || '').trim(),
    category: input.category || 'Regular Customer', creditLimit: assertAmount(input.creditLimit ?? existing?.creditLimit ?? 500000, 'Credit limit'),
    notes: (input.notes || '').trim(), debtBalance: existing?.debtBalance || 0, isDeleted: false,
    createdAt: existing?.createdAt || now, updatedAt: now
  };
  await transaction(async tx => {
    await saveCustomerRow(customer, tx);
    await enqueue('customers', customer.id, existing ? 'UPDATE' : 'CREATE', customer, tx);
    await audit(actor, existing ? 'CUSTOMER_UPDATED' : 'CUSTOMER_CREATED', customer.id, customer.name, tx);
  });
  return customer;
}

export async function recordCustomerPayment(customerId: string, amountInput: number, method: string, note: string, actor: Staff): Promise<CustomerPayment> {
  requirePermission(actor, 'canCollectDebt', 'collect customer debt');
  const amountCents = toCents(assertAmount(amountInput, 'Payment', false));
  return transaction(async tx => {
    const row = await first<Row>('SELECT data FROM customers WHERE id=? AND deleted=0', [customerId], tx);
    if (!row) throw new Error('Customer not found.');
    const customer = customerFromRow(row);
    const debtCents = toCents(customer.debtBalance);
    if (debtCents <= 0) throw new Error('This customer has no outstanding balance.');
    if (amountCents > debtCents) throw new Error('Payment cannot exceed the outstanding balance.');
    const remainingCents = debtCents - amountCents;
    const now = Date.now();
    const payment: CustomerPayment = {
      id: makeId(), customerId, customerName: customer.name, amount: centsToMoney(amountCents),
      previousDebt: centsToMoney(debtCents), remainingDebt: centsToMoney(remainingCents),
      paymentMethod: method || 'CASH', notes: note.trim(),
      receiptNumber: 'PAY-' + now.toString().slice(-8), paymentDate: now,
      recordedBy: actor.name, branchId: actor.branchId || 'main_branch'
    };
    customer.debtBalance = payment.remainingDebt;
    customer.updatedAt = now;
    await saveCustomerRow(customer, tx);
    await execute('INSERT INTO customer_payments(id,customer_id,amount_cents,created_at,data) VALUES(?,?,?,?,?)',
      [payment.id, customerId, amountCents, now, toJson(payment)], tx);
    await enqueue('customer_payments', payment.id, 'CREATE', payment, tx);
    await enqueue('customers', customerId, 'UPDATE', { id: customerId, debtPayment: payment.amount, remainingDebt: payment.remainingDebt }, tx);
    await audit(actor, 'CUSTOMER_PAYMENT_RECEIVED', customerId, payment.amount + ' via ' + payment.paymentMethod, tx);
    return payment;
  });
}

export async function checkout(input: CheckoutInput, actor: Staff): Promise<Sale> {
  requirePermission(actor, 'canSellPOS', 'complete sales');
  if (!input.items.length) throw new Error('Add at least one item before checkout.');
  const discountCents = toCents(assertAmount(input.discountAmount, 'Discount'));
  const paidCentsInput = toCents(assertAmount(input.amountPaid, 'Amount paid'));
  if (discountCents > 0) requirePermission(actor, 'canApplyDiscounts', 'apply discounts');
  return transaction(async tx => {
    const branchId = input.branchId || actor.branchId || 'main_branch';
    const branchRow = await first<Row>('SELECT data FROM branches WHERE id=? AND active=1', [branchId], tx);
    if (!branchRow) throw new Error('The selected branch is not active.');
    const branch = branchFromRow(branchRow);
    if (actor.branchId && actor.branchId !== branchId) throw new Error('Your account is assigned to a different branch.');
    const resolved: Array<{ product: Product; quantity: number; unitPrice: number; lineCents: number; costCents: number }> = [];
    for (const line of input.items) {
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error('Every item quantity must be greater than zero.');
      const row = await first<Row>('SELECT data FROM products WHERE id=? AND deleted=0', [line.productId], tx);
      if (!row) throw new Error('A product in the cart is no longer in the catalogue. Refresh the basket.');
      const product = productFromRow(row);
      if (product.branchId && product.branchId !== branchId) throw new Error('A sale cannot include products assigned to another branch.');
      const unitPrice = line.customPrice == null ? product.sellingPrice : assertAmount(line.customPrice, 'Custom price');
      if (line.customPrice != null) requirePermission(actor, 'canApplyDiscounts', 'override product prices');
      resolved.push({
        product, quantity: line.quantity, unitPrice,
        lineCents: multiplyPriceQuantityCents(unitPrice, line.quantity),
        costCents: multiplyPriceQuantityCents(product.costPrice, line.quantity)
      });
    }
    const subtotalCents = resolved.reduce((sum, line) => sum + line.lineCents, 0);
    if (subtotalCents <= 0 || discountCents > subtotalCents) throw new Error('The discount is greater than the sale subtotal or the total is zero.');
    const totalCents = subtotalCents - discountCents;
    if (totalCents <= 0) throw new Error('The sale total must be greater than zero after discount.');
    if (paidCentsInput > totalCents) throw new Error('Amount paid cannot exceed the sale total.');
    const unpaidCents = totalCents - paidCentsInput;
    let customer: Customer | null = null;
    if (input.customerId) {
      const customerRow = await first<Row>('SELECT data FROM customers WHERE id=? AND deleted=0', [input.customerId], tx);
      if (!customerRow) throw new Error('Selected customer no longer exists. Refresh customers and retry.');
      customer = customerFromRow(customerRow);
    }
    if (unpaidCents > 0 && !customer) throw new Error('Select a customer before recording an unpaid or partially paid sale.');
    if (input.enforceCreditLimit !== false && customer && unpaidCents > 0 && customer.creditLimit > 0) {
      if (toCents(customer.debtBalance) + unpaidCents > toCents(customer.creditLimit)) {
        throw new Error('Credit limit exceeded for ' + customer.name + '.');
      }
    }
    for (const line of resolved) {
      if (line.product.quantityInStock < line.quantity) {
        throw new Error('Insufficient stock for ' + line.product.name + '. Available: ' + line.product.quantityInStock + '.');
      }
    }
    const now = Date.now();
    const saleId = makeId();
    const receiptNumber = 'REC-' + new Date(now).toISOString().slice(2, 10).replace(/-/g, '') + '-' + saleId.slice(0, 8).toUpperCase();
    const totalCostCents = resolved.reduce((sum, line) => sum + line.costCents, 0);
    const paidCents = paidCentsInput;
    const lineItems: SaleLine[] = resolved.map(line => ({
      id: makeId(), saleId, productId: line.product.id, productName: line.product.name,
      category: line.product.category, unit: line.product.unit, quantitySold: line.quantity,
      costPriceAtSale: line.product.costPrice, unitPriceAtSale: line.unitPrice,
      subtotal: centsToMoney(line.lineCents), profit: centsToMoney(line.lineCents - line.costCents), branchId
    }));
    const sale: Sale = {
      id: saleId, receiptNumber, customerId: customer?.id || null, customerName: customer?.name || 'Walk-in Customer',
      saleDate: now, totalAmount: centsToMoney(totalCents), totalCost: centsToMoney(totalCostCents),
      totalProfit: centsToMoney(totalCents - totalCostCents), discountAmount: centsToMoney(discountCents),
      paymentMethod: input.paymentMethod || 'CASH',
      paymentStatus: paidCents >= totalCents ? 'PAID' : paidCents > 0 ? 'PARTIAL' : 'UNPAID',
      amountPaid: centsToMoney(paidCents), notes: input.notes.trim(), branchId, branchName: branch.name,
      cashierId: actor.id, cashierName: actor.name, items: lineItems
    };
    await execute('INSERT INTO sales(id,receipt_number,customer_id,branch_id,total_cents,paid_cents,profit_cents,created_at,data) VALUES(?,?,?,?,?,?,?,?,?)',
      [sale.id, sale.receiptNumber, sale.customerId, sale.branchId, totalCents, paidCents, totalCents - totalCostCents, now, toJson(sale)], tx);
    for (const line of resolved) {
      const product = line.product;
      product.quantityInStock -= line.quantity;
      product.updatedAt = now;
      product.syncVersion += 1;
      product.hlcTimestamp = tickHlc(product.hlcTimestamp, now);
      await saveProductRow(product, tx);
    }
    for (const line of lineItems) {
      await execute('INSERT INTO sale_items(id,sale_id,product_id,quantity,data) VALUES(?,?,?,?,?)',
        [line.id, sale.id, line.productId, line.quantitySold, toJson(line)], tx);
    }
    if (customer && unpaidCents > 0) {
      customer.debtBalance = centsToMoney(toCents(customer.debtBalance) + unpaidCents);
      customer.updatedAt = now;
      await saveCustomerRow(customer, tx);
    }
    await enqueue('sales', sale.id, 'CREATE', sale, tx);
    await audit(actor, 'SALE_COMPLETED', sale.id, sale.receiptNumber + ' • ' + sale.totalAmount, tx);
    return sale;
  });
}

export async function reverseSale(saleId: string, actor: Staff): Promise<void> {
  requirePermission(actor, 'canDeleteRecords', 'reverse sales');
  await transaction(async tx => {
    const row = await first<Row>('SELECT data FROM sales WHERE id=?', [saleId], tx);
    if (!row) throw new Error('Sale not found.');
    const sale = saleFromRow(row);
    const now = Date.now();
    for (const line of sale.items) {
      const productRow = await first<Row>('SELECT data FROM products WHERE id=?', [line.productId], tx);
      if (productRow) {
        const product = productFromRow(productRow);
        product.quantityInStock += line.quantitySold;
        product.updatedAt = now;
        product.syncVersion += 1;
        product.hlcTimestamp = tickHlc(product.hlcTimestamp, now);
        await saveProductRow(product, tx);
      }
    }
    const debtCents = Math.max(0, toCents(sale.totalAmount) - toCents(sale.amountPaid));
    if (sale.customerId && debtCents > 0) {
      const customerRow = await first<Row>('SELECT data FROM customers WHERE id=?', [sale.customerId], tx);
      if (customerRow) {
        const customer = customerFromRow(customerRow);
        customer.debtBalance = centsToMoney(Math.max(0, toCents(customer.debtBalance) - debtCents));
        customer.updatedAt = now;
        await saveCustomerRow(customer, tx);
      }
    }
    await execute('DELETE FROM sales WHERE id=?', [saleId], tx);
    await execute('INSERT OR REPLACE INTO sync_tombstones(id,table_name,record_id,deleted_at,hlc) VALUES(?,?,?,?,?)',
      ['sales:' + saleId, 'sales', saleId, now, tickHlc('0', now)], tx);
    await enqueue('sales', saleId, 'DELETE', { id: saleId, deletedAt: now }, tx);
    await audit(actor, 'SALE_REVERSED', saleId, sale.receiptNumber, tx);
  });
}

export async function recordPurchase(input: {
  productId: string; quantity: number; unitCostPrice: number; newSellingPrice?: number;
  supplierName: string; supplierPhone: string; paymentStatus: string; invoiceNumber: string; notes: string; branchId: string;
}, actor: Staff): Promise<Purchase> {
  requirePermission(actor, 'canManageInventory', 'record purchases');
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('Purchased quantity must be greater than zero.');
  assertAmount(input.unitCostPrice, 'Unit cost');
  if (input.newSellingPrice != null) assertAmount(input.newSellingPrice, 'New selling price');
  return transaction(async tx => {
    const row = await first<Row>('SELECT data FROM products WHERE id=? AND deleted=0', [input.productId], tx);
    if (!row) throw new Error('Product not found. Add the catalogue item before receiving stock.');
    const product = productFromRow(row);
    const branchId = input.branchId || actor.branchId || 'main_branch';
    if (actor.branchId && actor.branchId !== branchId) throw new Error('Your account is assigned to a different branch.');
    if (product.branchId && product.branchId !== branchId) throw new Error('Purchase branch does not match the product branch.');
    const now = Date.now();
    const totalCents = multiplyPriceQuantityCents(input.unitCostPrice, input.quantity);
    const purchase: Purchase = {
      id: makeId(), productId: product.id, productName: product.name,
      supplierName: input.supplierName.trim() || 'Direct Supplier', supplierPhone: input.supplierPhone.trim(),
      quantityPurchased: input.quantity, unitCostPrice: roundMoney(input.unitCostPrice),
      totalPurchaseCost: centsToMoney(totalCents),
      sellingPriceAtPurchase: input.newSellingPrice ?? product.sellingPrice,
      paymentStatus: input.paymentStatus || 'PAID_CASH',
      invoiceNumber: input.invoiceNumber.trim() || ('INV-' + now),
      branchId, notes: input.notes.trim(), purchaseDate: now
    };
    product.quantityInStock += input.quantity;
    product.costPrice = purchase.unitCostPrice;
    if (input.newSellingPrice != null && input.newSellingPrice > 0) product.sellingPrice = roundMoney(input.newSellingPrice);
    product.updatedAt = now;
    product.syncVersion += 1;
    product.hlcTimestamp = tickHlc(product.hlcTimestamp, now);
    await saveProductRow(product, tx);
    await execute('INSERT INTO purchases(id,product_id,branch_id,total_cents,created_at,data) VALUES(?,?,?,?,?,?)',
      [purchase.id, purchase.productId, branchId, totalCents, now, toJson(purchase)], tx);
    await enqueue('purchases', purchase.id, 'CREATE', purchase, tx);
    await enqueue('products', product.id, 'UPDATE', product, tx);
    await audit(actor, 'PURCHASE_RECORDED', purchase.id, purchase.invoiceNumber, tx);
    return purchase;
  });
}

export async function saveBranch(input: Partial<Branch> & { name: string }, actor: Staff): Promise<Branch> {
  requirePermission(actor, 'canManageShopSettings', 'manage branches');
  if (!input.name.trim()) throw new Error('Branch name is required.');
  const row = input.id ? await first<Row>('SELECT data FROM branches WHERE id=?', [input.id]) : null;
  const existing = row ? branchFromRow(row) : null;
  const now = Date.now();
  const branch: Branch = {
    id: input.id || makeId(), name: input.name.trim(), code: (input.code || '').trim() || 'BR-' + now.toString().slice(-4),
    locationType: input.locationType || 'STORE', address: (input.address || '').trim(),
    phone: (input.phone || '').trim(), managerName: (input.managerName || '').trim(),
    isMainBranch: existing?.isMainBranch || false, isActive: input.isActive ?? true,
    operationalStatus: input.operationalStatus || 'OPEN', notes: (input.notes || '').trim(),
    createdAt: existing?.createdAt || now, updatedAt: now
  };
  await transaction(async tx => {
    await saveBranchRow(branch, tx);
    await enqueue('branches', branch.id, existing ? 'UPDATE' : 'CREATE', branch, tx);
    await audit(actor, existing ? 'BRANCH_UPDATED' : 'BRANCH_CREATED', branch.id, branch.name, tx);
  });
  return branch;
}

export async function recordStockTransfer(input: {
  productId: string; fromBranchId: string; toBranchId: string; quantity: number; notes: string;
}, actor: Staff): Promise<StockTransfer> {
  requirePermission(actor, 'canManageInventory', 'transfer stock');
  if (input.fromBranchId === input.toBranchId) throw new Error('Select two different branches.');
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('Transfer quantity must be greater than zero.');
  return transaction(async tx => {
    const fromRow = await first<Row>('SELECT data FROM branches WHERE id=? AND active=1', [input.fromBranchId], tx);
    const toRow = await first<Row>('SELECT data FROM branches WHERE id=? AND active=1', [input.toBranchId], tx);
    const productRow = await first<Row>('SELECT data FROM products WHERE id=? AND deleted=0', [input.productId], tx);
    if (!fromRow || !toRow || !productRow) throw new Error('The product or one of the branches is not available.');
    if (actor.branchId && actor.branchId !== input.fromBranchId) throw new Error('Your account cannot transfer stock from this branch.');
    const product = productFromRow(productRow);
    if (product.branchId && product.branchId !== input.fromBranchId) throw new Error('The product does not belong to the source branch.');
    if (product.quantityInStock < input.quantity) throw new Error('Not enough stock to transfer.');
    const now = Date.now();
    product.quantityInStock -= input.quantity;
    product.updatedAt = now;
    product.syncVersion += 1;
    product.hlcTimestamp = tickHlc(product.hlcTimestamp, now);
    await saveProductRow(product, tx);
    const fromBranch = branchFromRow(fromRow);
    const toBranch = branchFromRow(toRow);
    const transfer: StockTransfer = {
      id: makeId(), transferNumber: 'TRF-' + now.toString().slice(-8),
      productId: product.id, productName: product.name,
      fromBranchId: input.fromBranchId, toBranchId: input.toBranchId,
      quantity: input.quantity, status: 'IN_TRANSIT', notes: input.notes.trim(),
      transferredBy: actor.name, receivedBy: '',
      transferDate: now, receivedAt: 0
    };
    await execute('INSERT INTO stock_transfers(id,product_id,from_branch_id,to_branch_id,quantity,status,created_at,data) VALUES(?,?,?,?,?,?,?,?)',
      [transfer.id, transfer.productId, transfer.fromBranchId, transfer.toBranchId, transfer.quantity, transfer.status, now, toJson(transfer)], tx);
    await enqueue('stock_transfers', transfer.id, 'CREATE', transfer, tx);
    await enqueue('products', product.id, 'UPDATE', product, tx);
    await audit(actor, 'STOCK_TRANSFER_CREATED', transfer.id, fromBranch.name + ' to ' + toBranch.name, tx);
    return transfer;
  });
}

export async function confirmStockTransfer(transferId: string, actor: Staff): Promise<void> {
  requirePermission(actor, 'canManageInventory', 'confirm stock transfers');
  await transaction(async tx => {
    const transferRow = await first<Row>('SELECT data FROM stock_transfers WHERE id=?', [transferId], tx);
    if (!transferRow) throw new Error('Stock transfer not found.');
    const transfer = fromJson<StockTransfer>(transferRow.data);
    if (transfer.status !== 'IN_TRANSIT') throw new Error('Only an in-transit transfer can be received.');
    if (actor.branchId && actor.branchId !== transfer.toBranchId) throw new Error('Your account cannot receive stock at this branch.');
    const productRow = await first<Row>('SELECT data FROM products WHERE id=?', [transfer.productId], tx);
    if (!productRow) throw new Error('Transferred product record was not found.');
    const product = productFromRow(productRow);
    product.branchId = transfer.toBranchId;
    product.quantityInStock += transfer.quantity;
    product.updatedAt = Date.now();
    product.syncVersion += 1;
    product.hlcTimestamp = tickHlc(product.hlcTimestamp, product.updatedAt);
    transfer.status = 'COMPLETED';
    transfer.receivedBy = actor.name;
    transfer.receivedAt = product.updatedAt;
    await saveProductRow(product, tx);
    await execute('UPDATE stock_transfers SET status=?,data=? WHERE id=?', [transfer.status, toJson(transfer), transfer.id], tx);
    await enqueue('stock_transfers', transfer.id, 'UPDATE', transfer, tx);
    await enqueue('products', product.id, 'UPDATE', product, tx);
    await audit(actor, 'STOCK_TRANSFER_RECEIVED', transfer.id, transfer.transferNumber, tx);
  });
}

export async function saveStaff(input: {
  id?: string; name: string; username: string; phone: string; role: Role; branchId: string;
  pin: string; password: string; isActive: boolean;
}, actor: Staff): Promise<Staff> {
  requirePermission(actor, 'canManageCollaborators', 'manage staff');
  if (!input.name.trim()) throw new Error('Staff name is required.');
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,80}$/.test(username)) throw new Error('Choose a valid staff username.');
  const duplicate = await first<Row>('SELECT id FROM users WHERE username=? COLLATE NOCASE AND id != ?', [username, input.id || '']);
  if (duplicate) throw new Error('That username is already assigned to another staff member.');
  const existingRow = input.id ? await first<Row>('SELECT data FROM users WHERE id=?', [input.id]) : null;
  const existing = existingRow ? staffFromRow(existingRow) : null;
  if (input.pin.trim()) {
    const pinIssue = validatePin(input.pin);
    if (pinIssue) throw new Error(pinIssue);
  }
  if (input.password.trim()) {
    const passwordIssue = validatePassword(input.password);
    if (passwordIssue) throw new Error(passwordIssue);
  }
  if (!existing && (!input.pin.trim() || !input.password.trim())) throw new Error('Set both a staff PIN and password.');
  const now = Date.now();
  const staff: Staff = {
    id: input.id || makeId(), name: input.name.trim(), username, phone: input.phone.trim(),
    role: input.role, branchId: input.branchId, branchName: '', isActive: input.isActive,
    pinHash: input.pin.trim() ? hashCredential(input.pin) : existing?.pinHash || '',
    passwordHash: input.password.trim() ? hashCredential(input.password) : existing?.passwordHash || '',
    createdAt: existing?.createdAt || now, updatedAt: now, lastLoginAt: existing?.lastLoginAt || 0,
    ...ROLE_PERMISSIONS[input.role]
  };
  await transaction(async tx => {
    await execute('INSERT INTO users(id,username,role,branch_id,active,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,role=excluded.role,branch_id=excluded.branch_id,active=excluded.active,data=excluded.data,updated_at=excluded.updated_at',
      [staff.id, staff.username, staff.role, staff.branchId, staff.isActive ? 1 : 0, toJson(staff), staff.createdAt, staff.updatedAt], tx);
    await enqueue('users', staff.id, existing ? 'UPDATE' : 'CREATE', { ...staff, pinHash: '', passwordHash: '' }, tx);
    await audit(actor, existing ? 'STAFF_UPDATED' : 'STAFF_CREATED', staff.id, staff.username, tx);
  });
  return staff;
}

export async function saveShopSettings(input: Partial<ShopProfile>, actor: Staff): Promise<ShopProfile> {
  requirePermission(actor, 'canManageShopSettings', 'change shop settings');
  const existing = await currentProfile();
  if (!existing) throw new Error('Shop profile not found.');
  const profile: ShopProfile = {
    ...existing,
    shopName: (input.shopName ?? existing.shopName).trim(),
    ownerName: (input.ownerName ?? existing.ownerName).trim(),
    phone: (input.phone ?? existing.phone).trim(),
    address: (input.address ?? existing.address).trim(),
    businessType: input.businessType ?? existing.businessType,
    currencyCode: (input.currencyCode ?? existing.currencyCode).trim().toUpperCase(),
    currencySymbol: (input.currencySymbol ?? existing.currencySymbol).trim(),
    taxRate: input.taxRate ?? existing.taxRate,
    receiptHeader: input.receiptHeader ?? existing.receiptHeader,
    receiptFooter: input.receiptFooter ?? existing.receiptFooter,
    lowStockThresholdDefault: input.lowStockThresholdDefault ?? existing.lowStockThresholdDefault,
    updatedAt: Date.now()
  };
  await transaction(async tx => {
    await execute('UPDATE shop_profile SET data=?,updated_at=? WHERE id=1', [toJson(profile), profile.updatedAt], tx);
    await enqueue('shop_profile', '1', 'UPDATE', profile, tx);
    await audit(actor, 'SHOP_SETTINGS_UPDATED', '1', profile.shopName, tx);
  });
  return profile;
}

export async function getOutbox(): Promise<SyncOutboxItem[]> {
  const rows = await query<Row>('SELECT * FROM sync_outbox WHERE status != "SYNCED" ORDER BY created_at');
  return rows.map(outboxFromRow);
}

export async function addAuditEvent(actor: Staff | null, action: string, targetId: string, details: string): Promise<void> {
  await audit(actor, action, targetId, details);
}

export async function storeDiagnostics(): Promise<{
  pending: number; failed: number; localRows: number; lastSyncAt: number; subscriptionActive: boolean;
}> {
  const profile = await currentProfile();
  const pending = await first<Row>('SELECT COUNT(*) AS value FROM sync_outbox WHERE status="PENDING"');
  const failed = await first<Row>('SELECT COUNT(*) AS value FROM sync_outbox WHERE status="FAILED"');
  const tables = ['products', 'customers', 'sales', 'users', 'branches', 'purchases', 'stock_transfers'];
  let localRows = 0;
  for (const table of tables) {
    const count = await first<Row>('SELECT COUNT(*) AS value FROM ' + table);
    localRows += Number(count?.value || 0);
  }
  return {
    pending: Number(pending?.value || 0), failed: Number(failed?.value || 0),
    localRows, lastSyncAt: profile?.lastSyncedAt || 0,
    subscriptionActive: profile ? isSubscriptionActive(profile) : false
  };
}

export async function clearLocalSession(): Promise<void> {
  // The iOS user ID is deliberately held by the app process, not persisted as an unlocked session.
  await execute('PRAGMA optimize');
}
