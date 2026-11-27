import { execute, first, getDatabase, query, transaction } from './database';
import {
  calculateSubscriptionQuote, centsToMoney, compareHlcVersions, computeVoucherFingerprint, hashCredential, isSubscriptionActive, makeId, multiplyPriceQuantityCents,
  nowHlc, roundMoney, tickHlc, toCents, validatePassword, validatePin, verifyBB3Voucher, verifyCredential
} from '../core/domain';
import {
  Branch, CartLine, CheckoutInput, Customer, CustomerPayment, HeldCart, Permissions, Product, Purchase,
  Role, Sale, SaleLine, ShopProfile, RedeemedVoucher, Staff, StockTransfer, StoreSnapshot, SyncOutboxItem,
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

export async function saveHeldCart(
  input: Omit<HeldCart, 'id' | 'createdAt'>,
  actor: Staff
): Promise<HeldCart> {
  requirePermission(actor, 'canSellPOS', 'hold POS carts');
  if (!input.items.length) throw new Error('A cart must contain at least one item before it can be held.');
  if (input.items.length > 500) throw new Error('This cart contains too many line items to save.');
  const now = Date.now();
  const held: HeldCart = {
    ...input,
    id: makeId(),
    label: input.label.trim().slice(0, 80) || 'Held sale ' + new Date(now).toLocaleString(),
    items: input.items.map(line => ({ ...line })),
    createdAt: now
  };
  await execute('INSERT INTO held_carts(id,label,data,created_at) VALUES(?,?,?,?)',
    [held.id, held.label, toJson(held), now]);
  await audit(actor, 'POS_CART_HELD', held.id, held.label + ' • ' + held.items.length + ' lines');
  return held;
}

export async function deleteHeldCart(heldCartId: string, actor: Staff): Promise<void> {
  requirePermission(actor, 'canSellPOS', 'manage held POS carts');
  const row = await first<Row>('SELECT data FROM held_carts WHERE id=?', [heldCartId]);
  if (!row) return;
  const held = fromJson<HeldCart>(row.data);
  await execute('DELETE FROM held_carts WHERE id=?', [heldCartId]);
  await audit(actor, 'POS_HELD_CART_DELETED', heldCartId, held.label);
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
  const heldCartRows = await query<Row>('SELECT data FROM held_carts ORDER BY created_at DESC');
  const redeemedVoucherRows = await query<Row>('SELECT * FROM redeemed_vouchers ORDER BY redeemed_at DESC');
  const voucherClockRow = await first<Row>('SELECT value FROM app_meta WHERE key=?', ['voucher_clock_highwater_ms']);
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
    heldCarts: heldCartRows.map(row => fromJson<HeldCart>(row.data)),
    redeemedVouchers: redeemedVoucherRows.map(row => ({
      fingerprint: String(row.fingerprint),
      voucherCode: String(row.voucher_code),
      planName: String(row.plan_name),
      daysAdded: Number(row.days_added) || 0,
      verifiedAmountRwf: Number(row.verified_amount_rwf) || 0,
      redeemedAt: Number(row.redeemed_at) || 0
    })),
    voucherClockHighWaterMs: Number(voucherClockRow?.value || 0),
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

export type EnrolledIosStaffAssignment = {
  shopId: string;
  ownerUsername: string;
  assignedUserId: string;
  assignedUsername: string;
  assignedUserName: string;
  assignedPhone: string;
  role: Role;
  branchId: string;
  branchName: string;
};

export async function prepareEnrolledDeviceStaff(
  assignment: EnrolledIosStaffAssignment,
  localCredentials: { pin: string; password: string }
): Promise<Staff> {
  const profile = await currentProfile();
  if (!profile) throw new Error('Create or restore this shop profile before pairing an iPhone.');
  const ownerUsername = profile.username.trim().toLowerCase();
  const ownerPhone = profile.phone.replace(/\D/g, '').slice(-9);
  const expectedShopId = ownerUsername + '_' + ownerPhone;
  if (assignment.shopId !== expectedShopId || assignment.ownerUsername.trim().toLowerCase() !== ownerUsername) {
    throw new Error('The enrolled device belongs to a different shop owner. The local BeBoss records were not changed.');
  }
  const username = assignment.assignedUsername.trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,80}$/.test(username) || !assignment.assignedUserId) {
    throw new Error('The owner-issued device invitation did not return a valid assigned staff identity.');
  }
  if (!['OWNER', 'MANAGER', 'CASHIER'].includes(assignment.role)) {
    throw new Error('The owner-issued invitation returned an unsupported staff role.');
  }
  const pinIssue = validatePin(localCredentials.pin);
  if (pinIssue) throw new Error(pinIssue);
  const passwordIssue = validatePassword(localCredentials.password);
  if (passwordIssue) throw new Error(passwordIssue);

  return transaction(async tx => {
    const targetRow = await first<Row>('SELECT data FROM users WHERE id=?', [assignment.assignedUserId], tx);
    const usernameRow = await first<Row>('SELECT data FROM users WHERE username=? COLLATE NOCASE', [username], tx);
    const target = targetRow ? staffFromRow(targetRow) : null;
    const matching = usernameRow ? staffFromRow(usernameRow) : null;
    if (target && matching && target.id !== matching.id) {
      throw new Error('This iPhone already has a different local staff account using that username. Resolve the local account before pairing.');
    }
    const existing = target || matching;
    const now = Date.now();
    const rolePermissions = ROLE_PERMISSIONS[assignment.role];
    const staff: Staff = {
      id: assignment.assignedUserId,
      name: assignment.assignedUserName.trim() || existing?.name || username,
      username,
      phone: assignment.assignedPhone.trim() || existing?.phone || '',
      role: assignment.role,
      branchId: assignment.branchId || '',
      branchName: assignment.branchName || 'Assigned branch',
      // These are iPhone-local unlock credentials only. The cloud never receives them.
      pinHash: hashCredential(localCredentials.pin),
      passwordHash: hashCredential(localCredentials.password),
      isActive: true,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastLoginAt: existing?.lastLoginAt || now,
      ...rolePermissions
    };

    if (existing && existing.id !== staff.id) {
      // The local first-run owner may have a different UUID from the cloud owner row.
      // Re-key only that same-username local row, preserving its records and audit history.
      await execute(
        'UPDATE users SET id=?,username=?,role=?,branch_id=?,active=?,data=?,updated_at=? WHERE id=?',
        [staff.id, staff.username, staff.role, staff.branchId, 1, toJson(staff), staff.updatedAt, existing.id],
        tx
      );
      await execute('UPDATE audit_logs SET actor_id=? WHERE actor_id=?', [staff.id, existing.id], tx);
      const pending = await query<Row>(
        'SELECT id,payload_json FROM sync_outbox WHERE table_name="users" AND record_id=?',
        [existing.id], tx
      );
      for (const item of pending) {
        let payload: Row = {};
        try { payload = JSON.parse(String(item.payload_json || '{}')); } catch { payload = {}; }
        await execute('UPDATE sync_outbox SET record_id=?,payload_json=?,updated_at=? WHERE id=?',
          [staff.id, toJson({ ...payload, id: staff.id, username: staff.username }), now, item.id], tx);
      }
      const sales = await query<Row>('SELECT id,data FROM sales', [], tx);
      for (const saleRow of sales) {
        try {
          const sale = fromJson<Sale>(saleRow.data);
          if (sale.cashierId === existing.id) {
            await execute('UPDATE sales SET data=? WHERE id=?', [toJson({ ...sale, cashierId: staff.id }), saleRow.id], tx);
          }
        } catch { /* Keep unreadable historical records unchanged; no transaction data is discarded. */ }
      }
    } else {
      await execute(
        'INSERT INTO users(id,username,role,branch_id,active,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,role=excluded.role,branch_id=excluded.branch_id,active=excluded.active,data=excluded.data,updated_at=excluded.updated_at',
        [staff.id, staff.username, staff.role, staff.branchId, 1, toJson(staff), staff.createdAt, staff.updatedAt],
        tx
      );
    }
    await audit(staff, 'IOS_DEVICE_STAFF_PROVISIONED', staff.id,
      'Mapped the owner-approved iPhone device assignment to a local staff unlock credential. Local PIN/password hashes were not sent to cloud.', tx);
    return staff;
  });
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

export async function restoreProduct(productId: string, actor: Staff): Promise<Product> {
  requirePermission(actor, 'canManageInventory', 'restore products');
  const row = await first<Row>('SELECT data FROM products WHERE id=?', [productId]);
  if (!row) throw new Error('Archived product not found.');
  const product = productFromRow(row);
  if (!product.isDeleted) return product;
  const now = Date.now();
  product.isDeleted = false;
  product.updatedAt = now;
  product.syncVersion += 1;
  product.hlcTimestamp = tickHlc(product.hlcTimestamp, now);
  await transaction(async tx => {
    await saveProductRow(product, tx);
    await execute('DELETE FROM sync_tombstones WHERE id=?', ['products:' + product.id], tx);
    await enqueue('products', product.id, 'UPDATE', { ...product, restored: true }, tx);
    await audit(actor, 'PRODUCT_RESTORED', product.id, product.name, tx);
  });
  return product;
}

export async function listArchivedProducts(): Promise<Product[]> {
  const rows = await query<Row>('SELECT data FROM products WHERE deleted=1 ORDER BY updated_at DESC');
  return rows.map(row => productFromRow(row));
}

export async function listArchivedCustomers(): Promise<Customer[]> {
  const rows = await query<Row>('SELECT data FROM customers WHERE deleted=1 ORDER BY updated_at DESC');
  return rows.map(row => customerFromRow(row));
}

export async function deleteCustomer(customerId: string, actor: Staff): Promise<void> {
  requirePermission(actor, 'canManageCustomers', 'manage customers');
  requirePermission(actor, 'canDeleteRecords', 'archive customers');
  await transaction(async tx => {
    const row = await first<Row>('SELECT data FROM customers WHERE id=? AND deleted=0', [customerId], tx);
    if (!row) throw new Error('Customer not found.');
    const customer = customerFromRow(row);
    const now = Date.now();
    customer.isDeleted = true;
    customer.updatedAt = now;
    await saveCustomerRow(customer, tx);
    await execute(
      'INSERT OR REPLACE INTO sync_tombstones(id,table_name,record_id,deleted_at,hlc) VALUES(?,?,?,?,?)',
      ['customers:' + customer.id, 'customers', customer.id, now, tickHlc('0', now)],
      tx
    );
    await enqueue('customers', customer.id, 'DELETE', { id: customer.id }, tx);
    await audit(actor, 'CUSTOMER_ARCHIVED', customer.id, customer.name, tx);
  });
}

export async function restoreCustomer(customerId: string, actor: Staff): Promise<Customer> {
  requirePermission(actor, 'canManageCustomers', 'restore customers');
  const row = await first<Row>('SELECT data FROM customers WHERE id=?', [customerId]);
  if (!row) throw new Error('Archived customer not found.');
  const customer = customerFromRow(row);
  if (!customer.isDeleted) return customer;
  const now = Date.now();
  customer.isDeleted = false;
  customer.updatedAt = now;
  await transaction(async tx => {
    await saveCustomerRow(customer, tx);
    await execute('DELETE FROM sync_tombstones WHERE id=?', ['customers:' + customer.id], tx);
    await enqueue('customers', customer.id, 'UPDATE', { ...customer, restored: true }, tx);
    await audit(actor, 'CUSTOMER_RESTORED', customer.id, customer.name, tx);
  });
  return customer;
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
  const paymentBreakdown = input.paymentMethod === 'SPLIT' ? (input.paymentBreakdown || []) : [];
  let paidCentsInput = toCents(assertAmount(input.amountPaid, 'Amount paid'));
  if (input.paymentMethod === 'SPLIT') {
    if (paymentBreakdown.length < 2) throw new Error('Split tender requires at least two payment methods.');
    const allowedMethods = new Set(['CASH', 'MOMO', 'AIRTEL', 'CARD', 'BANK']);
    const seenMethods = new Set<string>();
    let splitCents = 0;
    for (const part of paymentBreakdown) {
      if (!allowedMethods.has(part.method)) throw new Error('A split payment method is not supported.');
      if (seenMethods.has(part.method)) throw new Error('Use each split payment method once and combine its amount.');
      seenMethods.add(part.method);
      splitCents += toCents(assertAmount(part.amount, part.method + ' payment', false));
    }
    if (splitCents !== toCents(assertAmount(input.amountPaid, 'Split amount paid'))) {
      throw new Error('The split payment amounts do not equal the amount paid.');
    }
    paidCentsInput = splitCents;
  } else if (paymentBreakdown.length) {
    throw new Error('Payment allocations are only accepted for split-tender transactions.');
  }
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
      amountPaid: centsToMoney(paidCents),
      paymentBreakdown: input.paymentMethod === 'SPLIT'
        ? paymentBreakdown.map(part => ({ ...part, amount: centsToMoney(toCents(part.amount)) }))
        : undefined,
      notes: input.notes.trim(), branchId, branchName: branch.name,
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

export async function quickCustomSale(
  descriptionInput: string,
  amountInput: number,
  paymentMethodInput: string,
  actor: Staff
): Promise<Sale> {
  requirePermission(actor, 'canSellPOS', 'complete quick sales');
  const description = descriptionInput.trim().slice(0, 160) || 'Custom Quick Item';
  const totalCents = toCents(assertAmount(amountInput, 'Quick sale amount', false));
  if (totalCents <= 0) throw new Error('Quick sale amount must be greater than zero.');
  const method = paymentMethodInput.trim().toUpperCase() || 'CASH';
  if (!['CASH', 'MOMO', 'AIRTEL', 'CARD', 'BANK'].includes(method)) {
    throw new Error('Choose a supported quick-sale payment method.');
  }

  return transaction(async tx => {
    const branchRows = await query<Row>('SELECT data FROM branches WHERE active=1', [], tx);
    const branches = branchRows.map(row => branchFromRow(row));
    const eligible = branches.filter(branch =>
      branch.isActive &&
      branch.locationType.toUpperCase() !== 'WAREHOUSE' &&
      branch.operationalStatus.toUpperCase() === 'OPEN'
    );
    const branch = actor.branchId
      ? eligible.find(item => item.id === actor.branchId)
      : eligible.find(item => item.isMainBranch) || eligible[0];
    if (!branch) {
      throw new Error('Quick sales require an active, OPEN retail branch. Warehouse branches cannot process POS sales.');
    }

    const now = Date.now();
    const saleId = makeId();
    const receiptNumber = 'REC-' + new Date(now).toISOString().slice(2, 10).replace(/-/g, '') + '-' + saleId.slice(0, 8).toUpperCase();
    const costCents = Math.round(totalCents * 0.7);
    const line: SaleLine = {
      id: makeId(),
      saleId,
      productId: 'custom_' + saleId,
      productName: description,
      category: 'Quick Sale',
      unit: 'item',
      quantitySold: 1,
      costPriceAtSale: centsToMoney(costCents),
      unitPriceAtSale: centsToMoney(totalCents),
      subtotal: centsToMoney(totalCents),
      profit: centsToMoney(totalCents - costCents),
      branchId: branch.id
    };
    const sale: Sale = {
      id: saleId,
      receiptNumber,
      customerId: null,
      customerName: 'Quick Cash Customer',
      saleDate: now,
      totalAmount: centsToMoney(totalCents),
      totalCost: centsToMoney(costCents),
      totalProfit: centsToMoney(totalCents - costCents),
      discountAmount: 0,
      paymentMethod: method,
      paymentStatus: 'PAID',
      amountPaid: centsToMoney(totalCents),
      notes: 'Quick POS Sale: ' + description,
      branchId: branch.id,
      branchName: branch.name,
      cashierId: actor.id,
      cashierName: actor.name,
      items: [line]
    };
    await execute(
      'INSERT INTO sales(id,receipt_number,customer_id,branch_id,total_cents,paid_cents,profit_cents,created_at,data) VALUES(?,?,?,?,?,?,?,?,?)',
      [sale.id, sale.receiptNumber, null, sale.branchId, totalCents, totalCents, totalCents - costCents, now, toJson(sale)],
      tx
    );
    await execute(
      'INSERT INTO sale_items(id,sale_id,product_id,quantity,data) VALUES(?,?,?,?,?)',
      [line.id, sale.id, line.productId, 1, toJson(line)],
      tx
    );
    await enqueue('sales', sale.id, 'CREATE', sale, tx);
    await audit(actor, 'QUICK_CUSTOM_SALE_COMPLETED', sale.id, sale.receiptNumber + ' • ' + description + ' • ' + centsToMoney(totalCents), tx);
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

export async function deletePurchaseRecord(purchaseId: string, actor: Staff): Promise<void> {
  requirePermission(actor, 'canManageInventory', 'manage purchasing');
  requirePermission(actor, 'canDeleteRecords', 'delete purchase records');
  await transaction(async tx => {
    const row = await first<Row>('SELECT data FROM purchases WHERE id=?', [purchaseId], tx);
    if (!row) throw new Error('Purchase record not found.');
    const purchase = fromJson<Purchase>(row.data);
    await execute('DELETE FROM purchases WHERE id=?', [purchaseId], tx);
    const now = Date.now();
    await execute(
      'INSERT OR REPLACE INTO sync_tombstones(id,table_name,record_id,deleted_at,hlc) VALUES(?,?,?,?,?)',
      ['purchases:' + purchaseId, 'purchases', purchaseId, now, tickHlc('0', now)],
      tx
    );
    await enqueue('purchases', purchaseId, 'DELETE', { id: purchaseId }, tx);
    await audit(actor, 'PURCHASE_RECORD_DELETED', purchaseId, purchase.invoiceNumber, tx);
  });
}

export async function saveBranch(input: Partial<Branch> & { name: string }, actor: Staff): Promise<Branch> {
  if (!actor.isActive || !(actor.role === 'OWNER' || actor.role === 'MANAGER' || actor.canManageShopSettings)) {
    throw new Error('Access denied: only an owner or manager can manage branches.');
  }
  if (!input.name.trim()) throw new Error('Branch name is required.');
  const row = input.id ? await first<Row>('SELECT data FROM branches WHERE id=?', [input.id]) : null;
  const existing = row ? branchFromRow(row) : null;
  const now = Date.now();
  const locationType = input.locationType || existing?.locationType || 'STORE';
  const rawStatus = (input.operationalStatus || existing?.operationalStatus || 'OPEN').toUpperCase();
  const operationalStatus = rawStatus === 'SUSPENDED' ? 'PAUSED' : rawStatus;
  if (!['STORE', 'WAREHOUSE'].includes(locationType)) throw new Error('Location type must be STORE or WAREHOUSE.');
  if (locationType === 'WAREHOUSE' && (input.isMainBranch ?? existing?.isMainBranch)) {
    throw new Error('A warehouse cannot be the main retail/POS branch.');
  }
  if (!['OPEN', 'PAUSED', 'CLOSED'].includes(operationalStatus)) {
    throw new Error('Branch status must be OPEN, PAUSED or CLOSED.');
  }
  const branch: Branch = {
    id: input.id || makeId(),
    name: input.name.trim(),
    code: (input.code ?? existing?.code ?? '').trim() || 'BR-' + now.toString().slice(-4),
    locationType,
    address: (input.address ?? existing?.address ?? '').trim(),
    phone: (input.phone ?? existing?.phone ?? '').trim(),
    managerName: (input.managerName ?? existing?.managerName ?? '').trim(),
    isMainBranch: input.isMainBranch ?? existing?.isMainBranch ?? false,
    isActive: input.isActive ?? existing?.isActive ?? true,
    operationalStatus: operationalStatus as Branch['operationalStatus'],
    notes: (input.notes ?? existing?.notes ?? '').trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  await transaction(async tx => {
    if (branch.isMainBranch) {
      const others = await query<Row>('SELECT data FROM branches WHERE active=1', [], tx);
      for (const otherRow of others) {
        const other = branchFromRow(otherRow);
        if (other.id !== branch.id && other.isMainBranch) {
          const cleared = { ...other, isMainBranch: false, updatedAt: now };
          await saveBranchRow(cleared, tx);
          await enqueue('branches', cleared.id, 'UPDATE', cleared, tx);
        }
      }
    }
    await saveBranchRow(branch, tx);
    await execute('DELETE FROM sync_tombstones WHERE id=?', ['branches:' + branch.id], tx);
    await enqueue('branches', branch.id, existing ? 'UPDATE' : 'CREATE', branch, tx);
    await audit(actor, existing ? 'BRANCH_UPDATED' : 'BRANCH_CREATED', branch.id, branch.name + ' • ' + branch.locationType, tx);
  });
  return branch;
}

export async function setBranchOperationalStatus(
  branchId: string,
  statusInput: string,
  actor: Staff
): Promise<Branch> {
  if (!actor.isActive || !(actor.role === 'OWNER' || actor.role === 'MANAGER' || actor.canManageShopSettings)) {
    throw new Error('Access denied: you cannot change branch operating status.');
  }
  const status = statusInput.trim().toUpperCase() === 'SUSPENDED' ? 'PAUSED' : statusInput.trim().toUpperCase();
  if (!['OPEN', 'PAUSED', 'CLOSED'].includes(status)) throw new Error('Branch status must be OPEN, PAUSED or CLOSED.');
  return transaction(async tx => {
    const row = await first<Row>('SELECT data FROM branches WHERE id=? AND active=1', [branchId], tx);
    if (!row) throw new Error('Active branch not found.');
    const branch = branchFromRow(row);
    if (actor.branchId && actor.branchId !== branch.id && actor.role !== 'OWNER') {
      throw new Error('Your account cannot change another branch operating status.');
    }
    const updated: Branch = { ...branch, operationalStatus: status as Branch['operationalStatus'], updatedAt: Date.now() };
    await saveBranchRow(updated, tx);
    await enqueue('branches', updated.id, 'UPDATE', updated, tx);
    await audit(actor, 'BRANCH_STATUS_CHANGED', updated.id, branch.operationalStatus + ' → ' + status, tx);
    return updated;
  });
}

export async function archiveBranch(branchId: string, actor: Staff): Promise<void> {
  if (!actor.isActive || !(actor.role === 'OWNER' || actor.canManageShopSettings || actor.canDeleteRecords)) {
    throw new Error('Access denied: you cannot archive branches.');
  }
  await transaction(async tx => {
    const row = await first<Row>('SELECT data FROM branches WHERE id=? AND active=1', [branchId], tx);
    if (!row) throw new Error('Active branch not found.');
    const branch = branchFromRow(row);
    if (branch.isMainBranch) throw new Error('The main retail branch cannot be archived. Set another store as main first.');
    const staffRows = await query<Row>('SELECT data FROM users WHERE active=1', [], tx);
    const assignedStaff = staffRows.map(item => staffFromRow(item)).filter(item => item.branchId === branchId);
    if (assignedStaff.length) throw new Error('Reassign or suspend all staff assigned to this branch before archiving it.');
    const productCount = await first<Row>('SELECT COUNT(*) AS value FROM products WHERE branch_id=? AND deleted=0', [branchId], tx);
    if (Number(productCount?.value || 0) > 0) throw new Error('Move or archive all active products assigned to this branch before archiving it.');
    const transferCount = await first<Row>('SELECT COUNT(*) AS value FROM stock_transfers WHERE status="IN_TRANSIT" AND (from_branch_id=? OR to_branch_id=?)', [branchId, branchId], tx);
    if (Number(transferCount?.value || 0) > 0) throw new Error('Complete or cancel all in-transit stock transfers before archiving this branch.');
    const archived: Branch = { ...branch, isActive: false, updatedAt: Date.now() };
    await saveBranchRow(archived, tx);
    await execute(
      'INSERT OR REPLACE INTO sync_tombstones(id,table_name,record_id,deleted_at,hlc) VALUES(?,?,?,?,?)',
      ['branches:' + branchId, 'branches', branchId, archived.updatedAt, tickHlc('0', archived.updatedAt)],
      tx
    );
    await enqueue('branches', branchId, 'DELETE', { id: branchId, updatedAt: archived.updatedAt }, tx);
    await audit(actor, 'BRANCH_ARCHIVED', branchId, branch.name + ' archived after staff, inventory and transfer checks.', tx);
  });
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
    const fromBranch = branchFromRow(fromRow);
    const toBranch = branchFromRow(toRow);
    if (product.branchId && product.branchId !== input.fromBranchId) throw new Error('The product does not belong to the source branch.');
    if (fromBranch.operationalStatus !== 'OPEN' || toBranch.operationalStatus !== 'OPEN') {
      throw new Error('Both the sending and receiving branches must be open before stock can be transferred.');
    }
    if (product.quantityInStock < input.quantity) throw new Error('Not enough stock to transfer.');
    const now = Date.now();
    product.quantityInStock -= input.quantity;
    product.updatedAt = now;
    product.syncVersion += 1;
    product.hlcTimestamp = tickHlc(product.hlcTimestamp, now);
    await saveProductRow(product, tx);
    const transfer: StockTransfer = {
      id: makeId(),
      transferNumber: 'TRF-' + now.toString().slice(-8),
      productId: product.id,
      productName: product.name,
      fromBranchId: input.fromBranchId,
      fromBranchName: fromBranch.name,
      toBranchId: input.toBranchId,
      toBranchName: toBranch.name,
      quantity: input.quantity,
      unit: product.unit,
      costValue: roundMoney(product.costPrice * input.quantity),
      status: 'IN_TRANSIT',
      notes: input.notes.trim(),
      transferredBy: actor.name,
      receivedBy: '',
      transferDate: now,
      receivedAt: 0,
      updatedAt: now
    };
    await execute(
      'INSERT INTO stock_transfers(id,product_id,from_branch_id,to_branch_id,quantity,status,created_at,data) VALUES(?,?,?,?,?,?,?,?)',
      [transfer.id, transfer.productId, transfer.fromBranchId, transfer.toBranchId, transfer.quantity, transfer.status, now, toJson(transfer)],
      tx
    );
    await enqueue('stock_transfers', transfer.id, 'CREATE', transfer, tx);
    await enqueue('products', product.id, 'UPDATE', product, tx);
    await audit(actor, 'STOCK_TRANSFER_CREATED', transfer.id, fromBranch.name + ' → ' + toBranch.name + ' • ' + input.quantity + ' ' + product.unit, tx);
    return transfer;
  });
}

export async function confirmStockTransfer(transferId: string, actor: Staff): Promise<void> {
  requirePermission(actor, 'canManageInventory', 'confirm stock transfers');
  await transaction(async tx => {
    const transferRow = await first<Row>('SELECT data FROM stock_transfers WHERE id=?', [transferId], tx);
    if (!transferRow) throw new Error('Stock transfer not found.');
    const transfer = fromJson<StockTransfer>(transferRow.data);
    if (transfer.status === 'COMPLETED') return;
    if (transfer.status === 'CANCELLED') throw new Error('A cancelled transfer cannot be received.');
    if (actor.branchId && actor.branchId !== transfer.toBranchId) {
      throw new Error('Your account cannot receive stock at this branch.');
    }
    const sourceRow = await first<Row>('SELECT data FROM products WHERE id=?', [transfer.productId], tx);
    if (!sourceRow) throw new Error('The source product is missing. Restore it before receiving this transfer.');
    const source = productFromRow(sourceRow);
    if (source.isDeleted) throw new Error('The source product is archived. Restore it before receiving this transfer.');
    const destinationBranchRow = await first<Row>('SELECT data FROM branches WHERE id=? AND active=1', [transfer.toBranchId], tx);
    if (!destinationBranchRow) throw new Error('The destination branch is no longer active.');
    const destinationBranch = branchFromRow(destinationBranchRow);
    if (destinationBranch.operationalStatus !== 'OPEN') throw new Error('The receiving branch must be open to accept stock.');

    let destinationRow: Row | null = null;
    if (source.barcode.trim()) {
      destinationRow = await first<Row>(
        'SELECT data FROM products WHERE barcode=? AND branch_id=? AND deleted=0 ORDER BY created_at LIMIT 1',
        [source.barcode.trim(), transfer.toBranchId],
        tx
      );
    }
    if (!destinationRow) {
      const allDestinationProducts = await query<Row>(
        'SELECT data FROM products WHERE branch_id=? AND deleted=0',
        [transfer.toBranchId],
        tx
      );
      destinationRow = allDestinationProducts.find(item =>
        productFromRow(item).name.trim().toLowerCase() === source.name.trim().toLowerCase()
      ) || null;
    }
    const now = Date.now();
    let credited: Product;
    if (destinationRow) {
      credited = productFromRow(destinationRow);
      credited.quantityInStock += transfer.quantity;
      credited.updatedAt = now;
      credited.syncVersion += 1;
      credited.hlcTimestamp = tickHlc(credited.hlcTimestamp, now);
    } else {
      credited = {
        ...source,
        id: makeId(),
        branchId: transfer.toBranchId,
        quantityInStock: transfer.quantity,
        createdAt: now,
        updatedAt: now,
        syncVersion: 1,
        hlcTimestamp: tickHlc('0', now)
      };
    }
    await saveProductRow(credited, tx);
    transfer.status = 'COMPLETED';
    transfer.receivedBy = actor.name;
    transfer.receivedAt = now;
    transfer.updatedAt = now;
    await execute(
      'UPDATE stock_transfers SET status=?,data=? WHERE id=? AND status=?',
      [transfer.status, toJson(transfer), transfer.id, 'IN_TRANSIT'],
      tx
    );
    await enqueue('stock_transfers', transfer.id, 'UPDATE', transfer, tx);
    await enqueue('products', credited.id, destinationRow ? 'UPDATE' : 'CREATE', credited, tx);
    await audit(actor, 'STOCK_TRANSFER_RECEIVED', transfer.id, transfer.transferNumber + ' • credited ' + credited.name + ' at ' + destinationBranch.name, tx);
  });
}

export async function cancelStockTransfer(transferId: string, reason: string, actor: Staff): Promise<void> {
  requirePermission(actor, 'canManageInventory', 'cancel stock transfers');
  if (!reason.trim()) throw new Error('Enter a reason for cancelling this stock transfer.');
  await transaction(async tx => {
    const transferRow = await first<Row>('SELECT data FROM stock_transfers WHERE id=?', [transferId], tx);
    if (!transferRow) throw new Error('Stock transfer not found.');
    const transfer = fromJson<StockTransfer>(transferRow.data);
    if (transfer.status === 'CANCELLED') return;
    if (transfer.status === 'COMPLETED') {
      throw new Error('A completed transfer cannot be cancelled. Create a return transfer to move the stock back.');
    }
    if (actor.branchId && actor.branchId !== transfer.fromBranchId && actor.role !== 'OWNER') {
      throw new Error('Only the sending branch or shop owner can cancel this transfer.');
    }
    const sourceRow = await first<Row>('SELECT data FROM products WHERE id=? AND deleted=0', [transfer.productId], tx);
    if (!sourceRow) throw new Error('The source product is missing. Restore it before returning the transferred stock.');
    const source = productFromRow(sourceRow);
    source.quantityInStock += transfer.quantity;
    source.updatedAt = Date.now();
    source.syncVersion += 1;
    source.hlcTimestamp = tickHlc(source.hlcTimestamp, source.updatedAt);
    await saveProductRow(source, tx);
    transfer.status = 'CANCELLED';
    transfer.receivedBy = actor.name;
    transfer.receivedAt = source.updatedAt;
    transfer.updatedAt = source.updatedAt;
    transfer.notes = (transfer.notes ? transfer.notes + ' | ' : '') + '[CANCELLED: ' + reason.trim() + ']';
    await execute(
      'UPDATE stock_transfers SET status=?,data=? WHERE id=? AND status=?',
      [transfer.status, toJson(transfer), transfer.id, 'IN_TRANSIT'],
      tx
    );
    await enqueue('stock_transfers', transfer.id, 'UPDATE', transfer, tx);
    await enqueue('products', source.id, 'UPDATE', source, tx);
    await audit(actor, 'STOCK_TRANSFER_CANCELLED', transfer.id, transfer.transferNumber + ' • ' + reason.trim(), tx);
  });
}

export async function saveStaff(input: {
  id?: string; name: string; username: string; phone: string; role: Role; branchId: string;
  pin: string; password: string; isActive: boolean; permissions?: Partial<Permissions>;
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
    ...ROLE_PERMISSIONS[input.role],
    ...(input.permissions || existing || {})
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

export type BackupRestoreSummary = {
  branches: number;
  products: number;
  customers: number;
  sales: number;
  payments: number;
  purchases: number;
  transfers: number;
};

export async function restoreEncryptedBackupData(backup: any, actor: Staff): Promise<BackupRestoreSummary> {
  requirePermission(actor, 'canExportImportData', 'restore business backups');
  if (!backup || backup.format !== 'beboss_iphone_backup_v1' || !backup.profile) {
    throw new Error('This is not a supported BeBoss iPhone backup.');
  }
  const current = await currentProfile();
  if (!current) throw new Error('Register or pair this iPhone with a shop before restoring a backup.');
  const restoredProfile = backup.profile as ShopProfile;
  const sameOwner = restoredProfile.username?.trim().toLowerCase() === current.username.trim().toLowerCase();
  const samePhone = restoredProfile.phone.replace(/\D/g, '').slice(-9) === current.phone.replace(/\D/g, '').slice(-9);
  if (!sameOwner || !samePhone) {
    throw new Error('This backup belongs to a different shop owner. Restore it only on an iPhone already paired to that same shop.');
  }
  const branches = Array.isArray(backup.branches) ? backup.branches as Branch[] : [];
  const products = Array.isArray(backup.products) ? backup.products as Product[] : [];
  const customers = Array.isArray(backup.customers) ? backup.customers as Customer[] : [];
  const sales = Array.isArray(backup.sales) ? backup.sales as Sale[] : [];
  const payments = Array.isArray(backup.payments) ? backup.payments as CustomerPayment[] : [];
  const purchases = Array.isArray(backup.purchases) ? backup.purchases as Purchase[] : [];
  const transfers = Array.isArray(backup.transfers) ? backup.transfers as StockTransfer[] : [];
  const redeemedVouchers = Array.isArray(backup.redeemedVouchers) ? backup.redeemedVouchers as RedeemedVoucher[] : [];
  if (branches.length > 500 || products.length > 100000 || customers.length > 100000 ||
      sales.length > 250000 || payments.length > 250000 || purchases.length > 100000 || transfers.length > 100000 ||
      redeemedVouchers.length > 10000) {
    throw new Error('Backup exceeds supported record limits.');
  }
  const now = Date.now();
  const summary: BackupRestoreSummary = {
    branches: 0, products: 0, customers: 0, sales: 0, payments: 0, purchases: 0, transfers: 0
  };

  await transaction(async tx => {
    const currentCustomers = new Set((await query<Row>('SELECT id FROM customers', [], tx)).map(row => String(row.id)));
    const currentSales = new Set((await query<Row>('SELECT id,receipt_number FROM sales', [], tx)).flatMap(row => [String(row.id), String(row.receipt_number)]));

    for (const branch of branches) {
      if (!branch?.id || !branch.name?.trim()) throw new Error('Backup contains an invalid branch record.');
      const old = await first<Row>('SELECT data FROM branches WHERE id=?', [branch.id], tx);
      const merged = {
        ...branch,
        createdAt: old ? branchFromRow(old).createdAt : branch.createdAt || now,
        updatedAt: now
      };
      await saveBranchRow(merged, tx);
      await enqueue('branches', merged.id, old ? 'UPDATE' : 'CREATE', merged, tx);
      summary.branches += 1;
    }

    for (const product of products) {
      if (!product?.id || !product.name?.trim() || !Number.isFinite(product.quantityInStock) || product.quantityInStock < 0) {
        throw new Error('Backup contains an invalid product record.');
      }
      const old = await first<Row>('SELECT data FROM products WHERE id=?', [product.id], tx);
      const merged: Product = {
        ...product,
        branchId: product.branchId || 'main_branch',
        updatedAt: now,
        syncVersion: (old ? productFromRow(old).syncVersion : product.syncVersion || 0) + 1,
        hlcTimestamp: tickHlc(old ? productFromRow(old).hlcTimestamp : product.hlcTimestamp || '0', now)
      };
      await saveProductRow(merged, tx);
      await execute('DELETE FROM sync_tombstones WHERE id=?', ['products:' + merged.id], tx);
      await enqueue('products', merged.id, old ? 'UPDATE' : 'CREATE', merged, tx);
      summary.products += 1;
    }

    for (const customer of customers) {
      if (!customer?.id || !customer.name?.trim() || !Number.isFinite(customer.debtBalance) || customer.debtBalance < 0) {
        throw new Error('Backup contains an invalid customer record.');
      }
      const old = await first<Row>('SELECT data FROM customers WHERE id=?', [customer.id], tx);
      const merged: Customer = { ...customer, updatedAt: now };
      await saveCustomerRow(merged, tx);
      await enqueue('customers', merged.id, old ? 'UPDATE' : 'CREATE', merged, tx);
      currentCustomers.add(merged.id);
      summary.customers += 1;
    }

    for (const sale of sales) {
      if (!sale?.id || !sale.receiptNumber || !Array.isArray(sale.items) || !Number.isFinite(sale.totalAmount)) {
        throw new Error('Backup contains an invalid sales record.');
      }
      if (currentSales.has(sale.id) || currentSales.has(sale.receiptNumber)) continue;
      if (sale.customerId && !currentCustomers.has(sale.customerId)) {
        throw new Error('Backup sales reference a customer that is not available in the restored records.');
      }
      const safeSale: Sale = { ...sale, saleDate: Number(sale.saleDate) || now };
      await execute(
        'INSERT INTO sales(id,receipt_number,customer_id,branch_id,total_cents,paid_cents,profit_cents,created_at,data) VALUES(?,?,?,?,?,?,?,?,?)',
        [safeSale.id, safeSale.receiptNumber, safeSale.customerId, safeSale.branchId, toCents(safeSale.totalAmount),
          toCents(safeSale.amountPaid), toCents(safeSale.totalProfit), safeSale.saleDate, toJson(safeSale)],
        tx
      );
      for (const line of safeSale.items) {
        if (!line?.id || !line.productId || !Number.isFinite(line.quantitySold) || line.quantitySold <= 0) {
          throw new Error('Backup contains an invalid sales line.');
        }
        await execute(
          'INSERT OR IGNORE INTO sale_items(id,sale_id,product_id,quantity,data) VALUES(?,?,?,?,?)',
          [line.id, safeSale.id, line.productId, line.quantitySold, toJson(line)],
          tx
        );
      }
      await enqueue('sales', safeSale.id, 'CREATE', safeSale, tx);
      currentSales.add(safeSale.id);
      currentSales.add(safeSale.receiptNumber);
      summary.sales += 1;
    }

    for (const payment of payments) {
      if (!payment?.id || !payment.customerId || !Number.isFinite(payment.amount) || payment.amount <= 0) {
        throw new Error('Backup contains an invalid customer payment.');
      }
      if (!currentCustomers.has(payment.customerId)) throw new Error('Backup payment references a missing customer.');
      const alreadyExists = await first<Row>('SELECT id FROM customer_payments WHERE id=?', [payment.id], tx);
      if (alreadyExists) continue;
      await execute(
        'INSERT INTO customer_payments(id,customer_id,amount_cents,created_at,data) VALUES(?,?,?,?,?)',
        [payment.id, payment.customerId, toCents(payment.amount), payment.paymentDate || now, toJson(payment)],
        tx
      );
      await enqueue('customer_payments', payment.id, 'CREATE', payment, tx);
      summary.payments += 1;
    }

    for (const purchase of purchases) {
      if (!purchase?.id || !purchase.productId || !Number.isFinite(purchase.quantityPurchased)) {
        throw new Error('Backup contains an invalid purchase record.');
      }
      const exists = await first<Row>('SELECT id FROM purchases WHERE id=?', [purchase.id], tx);
      if (exists) continue;
      await execute(
        'INSERT INTO purchases(id,product_id,branch_id,total_cents,created_at,data) VALUES(?,?,?,?,?,?)',
        [purchase.id, purchase.productId, purchase.branchId, toCents(purchase.totalPurchaseCost), purchase.purchaseDate || now, toJson(purchase)],
        tx
      );
      await enqueue('purchases', purchase.id, 'CREATE', purchase, tx);
      summary.purchases += 1;
    }

    for (const transfer of transfers) {
      if (!transfer?.id || !transfer.productId || !Number.isFinite(transfer.quantity) || transfer.quantity <= 0) {
        throw new Error('Backup contains an invalid stock transfer.');
      }
      const exists = await first<Row>('SELECT id FROM stock_transfers WHERE id=?', [transfer.id], tx);
      if (exists) continue;
      await execute(
        'INSERT INTO stock_transfers(id,product_id,from_branch_id,to_branch_id,quantity,status,created_at,data) VALUES(?,?,?,?,?,?,?,?)',
        [transfer.id, transfer.productId, transfer.fromBranchId, transfer.toBranchId, transfer.quantity,
          transfer.status, transfer.transferDate || now, toJson(transfer)],
        tx
      );
      await enqueue('stock_transfers', transfer.id, 'CREATE', transfer, tx);
      summary.transfers += 1;
    }

    for (const voucher of redeemedVouchers) {
      if (!/^[0-9a-f]{64}$/i.test(voucher.fingerprint) || !voucher.voucherCode.startsWith('BB3-') ||
          !Number.isInteger(voucher.daysAdded) || voucher.daysAdded < 1 || voucher.daysAdded > 800) {
        throw new Error('Backup contains an invalid redeemed voucher ledger entry.');
      }
      await execute(
        'INSERT OR IGNORE INTO redeemed_vouchers(fingerprint,voucher_code,plan_name,days_added,verified_amount_rwf,redeemed_at) VALUES(?,?,?,?,?,?)',
        [voucher.fingerprint.toLowerCase(), voucher.voucherCode, voucher.planName, voucher.daysAdded,
          Math.max(0, Math.floor(voucher.verifiedAmountRwf)), voucher.redeemedAt || now],
        tx
      );
    }
    const backedUpClock = Math.max(0, Number(backup.voucherClockHighWaterMs) || 0);
    const existingClockRow = await first<Row>('SELECT value FROM app_meta WHERE key=?', ['voucher_clock_highwater_ms'], tx);
    const mergedClock = Math.max(backedUpClock, Number(existingClockRow?.value || 0), now);
    await execute('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      ['voucher_clock_highwater_ms', String(mergedClock)], tx);

    // Staff credentials, subscription claims and cloud device secrets are never restored from a portable backup.
    const safeProfile: ShopProfile = {
      ...current,
      shopName: restoredProfile.shopName,
      ownerName: restoredProfile.ownerName,
      phone: restoredProfile.phone,
      address: restoredProfile.address,
      businessType: restoredProfile.businessType,
      currencyCode: restoredProfile.currencyCode,
      currencySymbol: restoredProfile.currencySymbol,
      taxRate: restoredProfile.taxRate,
      receiptHeader: restoredProfile.receiptHeader,
      receiptFooter: restoredProfile.receiptFooter,
      lowStockThresholdDefault: restoredProfile.lowStockThresholdDefault,
      updatedAt: now
    };
    await execute('UPDATE shop_profile SET data=?,updated_at=? WHERE id=1', [toJson(safeProfile), now], tx);
    await enqueue('shop_profile', '1', 'UPDATE', safeProfile, tx);
    await audit(actor, 'BACKUP_RESTORED', safeProfile.username, JSON.stringify(summary), tx);
  });
  return summary;
}

function remoteVersionIsNewer(
  local: { hlc: string; updatedAt: number; version: number; deviceId: string },
  remote: { hlc: string; updatedAt: number; version: number; deviceId: string }
): boolean {
  return compareHlcVersions(local, remote) > 0;
}
function safeRemoteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function remoteHlc(value: unknown): string {
  if (typeof value === 'string') return value || '0';
  const parsed = safeRemoteNumber(value);
  return parsed > 0 ? String(Math.trunc(parsed)) : '0';
}
function normalizeRemoteBranchStatus(value: unknown): Branch['operationalStatus'] {
  const clean = String(value || 'OPEN').toUpperCase();
  if (clean === 'SUSPENDED' || clean === 'PAUSED') return 'PAUSED';
  if (clean === 'CLOSED') return 'CLOSED';
  return 'OPEN';
}

/**
 * Merge authenticated Android/iPhone BBSHARE2 snapshots using the Android HLC
 * ordering rules. It does not import credentials, subscription claims, device
 * tokens or cloud keys, and does not create outbox echo records.
 */
export async function mergeAndroidSharePackages(
  packages: Array<Record<string, any>>,
  expectedShopId: string
): Promise<number> {
  if (!packages.length) return 0;
  const profile = await currentProfile();
  if (!profile) throw new Error('This iPhone has no local shop profile.');
  const localPhone = profile.phone.replace(/\D/g, '').slice(-9);
  const localShopId = profile.username.trim().toLowerCase() + '_' + localPhone;
  if (expectedShopId !== localShopId) throw new Error('The remote snapshots do not belong to this iPhone shop identity.');
  const remoteSaleLinesBySale = new Map<string, SaleLine[]>();
  for (const root of packages) {
    const rows: Record<string, any>[] = Array.isArray(root.saleItems) ? root.saleItems : [];
    for (const row of rows) {
      const saleId = String(row.saleId || '');
      const id = String(row.id || '');
      if (!saleId || !id) continue;
      const line: SaleLine = {
        id, saleId, productId: String(row.productId || ''), productName: String(row.productName || ''),
        category: String(row.category || 'General'), unit: String(row.unit || 'pcs'),
        quantitySold: safeRemoteNumber(row.quantitySold), costPriceAtSale: safeRemoteNumber(row.costPriceAtSale),
        unitPriceAtSale: safeRemoteNumber(row.unitPriceAtSale), subtotal: safeRemoteNumber(row.subtotal),
        profit: safeRemoteNumber(row.profit), branchId: String(row.branchId || 'main_branch')
      };
      const list = remoteSaleLinesBySale.get(saleId) || [];
      if (!list.some(item => item.id === line.id)) list.push(line);
      remoteSaleLinesBySale.set(saleId, list);
    }
  }

  const merged = await transaction(async tx => {
    const now = Date.now();
    let changed = 0;
    const allSales = new Map<string, Sale>();
    const allTombstones = new Map<string, Record<string, any>>();

    for (const root of packages) {
      const remoteProfile = root.shopProfile || {};
      const remotePhone = String(remoteProfile.phone || '').replace(/\D/g, '').slice(-9);
      if (remotePhone && remotePhone !== localPhone) throw new Error('A remote snapshot owner phone does not match this shop.');

      const branchRows: Record<string, any>[] = Array.isArray(root.branches) ? root.branches : [];
      for (const row of branchRows) {
        const id = String(row.id || '');
        if (!id || !String(row.name || '').trim()) continue;
        const existingRow = await first<Row>('SELECT data FROM branches WHERE id=?', [id], tx);
        const existing = existingRow ? branchFromRow(existingRow) : null;
        const candidate: Branch = {
          id,
          name: String(row.name).trim(),
          code: String(row.code || 'BR-01'),
          locationType: String(row.locationType || 'STORE').toUpperCase() === 'WAREHOUSE' ? 'WAREHOUSE' : 'STORE',
          address: String(row.address || ''),
          phone: String(row.phone || ''),
          managerName: String(row.managerName || ''),
          isMainBranch: Boolean(row.isMainBranch),
          isActive: row.isActive !== false,
          operationalStatus: normalizeRemoteBranchStatus(row.operationalStatus),
          notes: String(row.notes || ''),
          createdAt: safeRemoteNumber(row.createdAt, now),
          updatedAt: safeRemoteNumber(row.updatedAt, now)
        };
        const remoteVersion = {
          hlc: remoteHlc(row.hlcTimestamp),
          updatedAt: candidate.updatedAt,
          version: safeRemoteNumber(row.syncVersion, 1),
          deviceId: String(row.lastModifiedDeviceId || '')
        };
        const localVersion = existing ? {
          hlc: '0', updatedAt: existing.updatedAt, version: 1, deviceId: ''
        } : null;
        if (!existing || remoteVersionIsNewer(localVersion!, remoteVersion)) {
          await saveBranchRow({ ...candidate, createdAt: existing?.createdAt || candidate.createdAt }, tx);
          changed += 1;
        }
      }

      const productRows: Record<string, any>[] = Array.isArray(root.products) ? root.products : [];
      for (const row of productRows) {
        const id = String(row.id || '');
        if (!id || !String(row.name || '').trim()) continue;
        const existingRow = await first<Row>('SELECT data FROM products WHERE id=?', [id], tx);
        const existing = existingRow ? productFromRow(existingRow) : null;
        const candidate: Product = {
          id,
          name: String(row.name).trim(),
          category: String(row.category || 'General'),
          barcode: String(row.barcode || ''),
          unit: String(row.unit || 'pcs'),
          branchId: String(row.branchId || 'main_branch'),
          costPrice: roundMoney(safeRemoteNumber(row.costPrice)),
          sellingPrice: roundMoney(safeRemoteNumber(row.sellingPrice)),
          quantityInStock: safeRemoteNumber(row.quantityInStock),
          lowStockThreshold: safeRemoteNumber(row.lowStockThreshold, 5),
          isDeleted: Boolean(row.isDeleted),
          syncVersion: safeRemoteNumber(row.syncVersion, 1),
          hlcTimestamp: remoteHlc(row.hlcTimestamp),
          createdAt: safeRemoteNumber(row.createdAt, now),
          updatedAt: safeRemoteNumber(row.updatedAt, now)
        };
        if (candidate.quantityInStock < 0 || candidate.costPrice < 0 || candidate.sellingPrice < 0) {
          throw new Error('The remote snapshot contains invalid product amounts or stock.');
        }
        const localVersion = existing ? {
          hlc: existing.hlcTimestamp, updatedAt: existing.updatedAt,
          version: existing.syncVersion, deviceId: ''
        } : null;
        const remoteVersion = {
          hlc: candidate.hlcTimestamp, updatedAt: candidate.updatedAt,
          version: candidate.syncVersion, deviceId: String(row.lastModifiedDeviceId || '')
        };
        if (!existing || remoteVersionIsNewer(localVersion!, remoteVersion)) {
          await saveProductRow({ ...candidate, createdAt: existing?.createdAt || candidate.createdAt }, tx);
          changed += 1;
        }
      }

      const customerRows: Record<string, any>[] = Array.isArray(root.customers) ? root.customers : [];
      for (const row of customerRows) {
        const id = String(row.id || '');
        if (!id || !String(row.name || '').trim()) continue;
        const existingRow = await first<Row>('SELECT data FROM customers WHERE id=?', [id], tx);
        const existing = existingRow ? customerFromRow(existingRow) : null;
        const candidate: Customer = {
          id,
          name: String(row.name).trim(),
          phone: String(row.phone || ''),
          email: String(row.email || ''),
          address: String(row.address || ''),
          city: String(row.city || ''),
          taxIdOrNin: String(row.taxIdOrNin || ''),
          category: String(row.category || 'Regular Customer'),
          creditLimit: safeRemoteNumber(row.creditLimit, 500000),
          notes: String(row.notes || ''),
          debtBalance: safeRemoteNumber(row.debtBalance),
          isDeleted: Boolean(row.isDeleted),
          createdAt: safeRemoteNumber(row.createdAt, now),
          updatedAt: safeRemoteNumber(row.updatedAt, now)
        };
        if (candidate.creditLimit < 0 || candidate.debtBalance < 0) throw new Error('The remote snapshot contains an invalid customer balance.');
        const localVersion = existing ? {
          hlc: '0', updatedAt: existing.updatedAt, version: 1, deviceId: ''
        } : null;
        const remoteVersion = {
          hlc: remoteHlc(row.hlcTimestamp), updatedAt: candidate.updatedAt,
          version: safeRemoteNumber(row.syncVersion, 1), deviceId: String(row.lastModifiedDeviceId || '')
        };
        if (!existing || remoteVersionIsNewer(localVersion!, remoteVersion)) {
          await saveCustomerRow({ ...candidate, createdAt: existing?.createdAt || candidate.createdAt }, tx);
          changed += 1;
        }
      }

      const userRows: Record<string, any>[] = Array.isArray(root.users) ? root.users : [];
      for (const row of userRows) {
        const id = String(row.id || '');
        const username = String(row.username || '').trim().toLowerCase();
        if (!id || !username) continue;
        const existingRow = await first<Row>('SELECT data FROM users WHERE id=?', [id], tx);
        const existing = existingRow ? staffFromRow(existingRow) : null;
        const role: Role = ['OWNER', 'MANAGER', 'CASHIER'].includes(String(row.role).toUpperCase())
          ? String(row.role).toUpperCase() as Role : 'CASHIER';
        const permissions = ROLE_PERMISSIONS[role];
        const remoteUpdatedAt = safeRemoteNumber(row.updatedAt, now);
        const remoteHlcValue = remoteHlc(row.hlcTimestamp);
        const shouldUpdate = !existing || remoteVersionIsNewer(
          { hlc: '0', updatedAt: existing.updatedAt, version: 1, deviceId: '' },
          { hlc: remoteHlcValue, updatedAt: remoteUpdatedAt, version: safeRemoteNumber(row.syncVersion, 1), deviceId: String(row.lastModifiedDeviceId || '') }
        );
        if (!shouldUpdate) continue;
        const candidate: Staff = {
          id,
          name: String(row.name || username),
          username,
          phone: String(row.phone || ''),
          role,
          branchId: String(row.assignedBranchId || row.branchId || ''),
          branchName: String(row.assignedBranchName || ''),
          pinHash: existing?.pinHash || '',
          passwordHash: existing?.passwordHash || '',
          isActive: row.isActive !== false,
          createdAt: existing?.createdAt || safeRemoteNumber(row.createdAt, now),
          updatedAt: remoteUpdatedAt,
          lastLoginAt: safeRemoteNumber(row.lastLoginAt),
          ...permissions,
          canSellPOS: Boolean(row.canSellPOS ?? permissions.canSellPOS),
          canApplyDiscounts: Boolean(row.canApplyDiscounts ?? permissions.canApplyDiscounts),
          canManageInventory: Boolean(row.canManageInventory ?? permissions.canManageInventory),
          canViewCostAndProfit: Boolean(row.canViewCostAndProfit ?? permissions.canViewCostAndProfit),
          canViewAnalytics: Boolean(row.canViewAnalytics ?? permissions.canViewAnalytics),
          canManageCustomers: Boolean(row.canManageCustomers ?? permissions.canManageCustomers),
          canCollectDebt: Boolean(row.canCollectDebt ?? permissions.canCollectDebt),
          canDeleteRecords: Boolean(row.canDeleteRecords ?? permissions.canDeleteRecords),
          canExportReports: Boolean(row.canExportReports ?? permissions.canExportReports),
          canManageCollaborators: Boolean(row.canManageCollaborators ?? permissions.canManageCollaborators),
          canManageShopSettings: Boolean(row.canManageShopSettings ?? permissions.canManageShopSettings),
          canExportImportData: Boolean(row.canExportImportData ?? permissions.canExportImportData)
        };
        await execute(
          'INSERT INTO users(id,username,role,branch_id,active,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,role=excluded.role,branch_id=excluded.branch_id,active=excluded.active,data=excluded.data,updated_at=excluded.updated_at',
          [candidate.id, candidate.username, candidate.role, candidate.branchId, candidate.isActive ? 1 : 0, toJson(candidate), candidate.createdAt, candidate.updatedAt],
          tx
        );
        changed += 1;
      }

      const saleRows: Record<string, any>[] = Array.isArray(root.sales) ? root.sales : [];
      for (const row of saleRows) {
        const id = String(row.id || '');
        const receiptNumber = String(row.receiptNumber || '');
        if (!id || !receiptNumber) continue;
        const existingRow = await first<Row>('SELECT data FROM sales WHERE id=?', [id], tx);
        const existing = existingRow ? saleFromRow(existingRow) : null;
        const items = (Array.isArray(row.items) ? row.items : (remoteSaleLinesBySale.get(id) || [])).map((item: any) => ({
          id: String(item.id || makeId()),
          saleId: id,
          productId: String(item.productId || ''),
          productName: String(item.productName || ''),
          category: String(item.category || 'General'),
          unit: String(item.unit || 'pcs'),
          quantitySold: safeRemoteNumber(item.quantitySold),
          costPriceAtSale: safeRemoteNumber(item.costPriceAtSale),
          unitPriceAtSale: safeRemoteNumber(item.unitPriceAtSale),
          subtotal: safeRemoteNumber(item.subtotal),
          profit: safeRemoteNumber(item.profit),
          branchId: String(item.branchId || row.branchId || 'main_branch')
        }));
        const candidate: Sale = {
          id,
          receiptNumber,
          customerId: row.customerId ? String(row.customerId) : null,
          customerName: String(row.customerName || 'Walk-in Customer'),
          saleDate: safeRemoteNumber(row.saleDate, now),
          totalAmount: safeRemoteNumber(row.totalAmount),
          totalCost: safeRemoteNumber(row.totalCost),
          totalProfit: safeRemoteNumber(row.totalProfit),
          discountAmount: safeRemoteNumber(row.discountAmount),
          paymentMethod: String(row.paymentMethod || 'CASH'),
          paymentStatus: ['PAID', 'PARTIAL', 'UNPAID'].includes(String(row.paymentStatus).toUpperCase())
            ? String(row.paymentStatus).toUpperCase() as Sale['paymentStatus'] : 'PAID',
          amountPaid: safeRemoteNumber(row.amountPaid),
          notes: String(row.notes || ''),
          branchId: String(row.branchId || 'main_branch'),
          branchName: String(row.branchName || ''),
          cashierId: String(row.cashierId || ''),
          cashierName: String(row.cashierName || ''),
          items
        };
        if (!existing) {
          const receiptExists = await first<Row>('SELECT id FROM sales WHERE receipt_number=?', [receiptNumber], tx);
          if (!receiptExists) {
            await execute(
              'INSERT INTO sales(id,receipt_number,customer_id,branch_id,total_cents,paid_cents,profit_cents,created_at,data) VALUES(?,?,?,?,?,?,?,?,?)',
              [candidate.id, candidate.receiptNumber, candidate.customerId, candidate.branchId, toCents(candidate.totalAmount),
                toCents(candidate.amountPaid), toCents(candidate.totalProfit), candidate.saleDate, toJson(candidate)],
              tx
            );
            changed += 1;
          }
        } else {
          const remoteVersion = {
            hlc: remoteHlc(row.hlcTimestamp), updatedAt: safeRemoteNumber(row.updatedAt, candidate.saleDate),
            version: safeRemoteNumber(row.syncVersion, 1), deviceId: String(row.lastModifiedDeviceId || '')
          };
          if (remoteVersionIsNewer(
            { hlc: '0', updatedAt: existing.saleDate, version: 1, deviceId: '' },
            remoteVersion
          )) {
            await execute(
              'UPDATE sales SET customer_id=?,branch_id=?,total_cents=?,paid_cents=?,profit_cents=?,created_at=?,data=? WHERE id=?',
              [candidate.customerId, candidate.branchId, toCents(candidate.totalAmount), toCents(candidate.amountPaid),
                toCents(candidate.totalProfit), candidate.saleDate, toJson({ ...candidate, items: existing.items }), id],
              tx
            );
            changed += 1;
          }
        }
        allSales.set(id, candidate);
      }

      const lineRows: Record<string, any>[] = Array.isArray(root.saleItems) ? root.saleItems : [];
      for (const row of lineRows) {
        const id = String(row.id || '');
        const saleId = String(row.saleId || '');
        if (!id || !saleId) continue;
        const line: SaleLine = {
          id, saleId, productId: String(row.productId || ''), productName: String(row.productName || ''),
          category: String(row.category || 'General'), unit: String(row.unit || 'pcs'),
          quantitySold: safeRemoteNumber(row.quantitySold), costPriceAtSale: safeRemoteNumber(row.costPriceAtSale),
          unitPriceAtSale: safeRemoteNumber(row.unitPriceAtSale), subtotal: safeRemoteNumber(row.subtotal),
          profit: safeRemoteNumber(row.profit), branchId: String(row.branchId || 'main_branch')
        };
        if (line.quantitySold <= 0 || !line.productId) continue;
        const exists = await first<Row>('SELECT id FROM sale_items WHERE id=?', [id], tx);
        if (!exists) {
          const parent = await first<Row>('SELECT id FROM sales WHERE id=?', [saleId], tx);
          if (parent) {
            await execute('INSERT INTO sale_items(id,sale_id,product_id,quantity,data) VALUES(?,?,?,?,?)',
              [id, saleId, line.productId, line.quantitySold, toJson(line)], tx);
          }
        }
      }

      const paymentRows: Record<string, any>[] = Array.isArray(root.customerPayments) ? root.customerPayments : [];
      for (const row of paymentRows) {
        const id = String(row.id || '');
        const customerId = String(row.customerId || '');
        const amount = safeRemoteNumber(row.amount);
        if (!id || !customerId || amount <= 0) continue;
        const exists = await first<Row>('SELECT id FROM customer_payments WHERE id=?', [id], tx);
        if (exists) continue;
        const customer = await first<Row>('SELECT id FROM customers WHERE id=?', [customerId], tx);
        if (!customer) continue;
        const payment: CustomerPayment = {
          id, customerId, customerName: String(row.customerName || ''),
          amount, previousDebt: safeRemoteNumber(row.previousDebt),
          remainingDebt: safeRemoteNumber(row.remainingDebt),
          paymentMethod: String(row.paymentMethod || 'CASH'), notes: String(row.notes || ''),
          receiptNumber: String(row.receiptNumber || id),
          paymentDate: safeRemoteNumber(row.paymentDate, now),
          recordedBy: String(row.recordedBy || ''),
          branchId: String(row.branchId || 'main_branch')
        };
        await execute('INSERT INTO customer_payments(id,customer_id,amount_cents,created_at,data) VALUES(?,?,?,?,?)',
          [payment.id, payment.customerId, toCents(payment.amount), payment.paymentDate, toJson(payment)], tx);
        changed += 1;
      }

      const purchaseRows: Record<string, any>[] = Array.isArray(root.purchases) ? root.purchases : [];
      for (const row of purchaseRows) {
        const id = String(row.id || '');
        if (!id) continue;
        const exists = await first<Row>('SELECT id FROM purchases WHERE id=?', [id], tx);
        if (exists) continue;
        const purchase: Purchase = {
          id,
          productId: String(row.productId || ''),
          productName: String(row.productName || ''),
          supplierName: String(row.supplierName || ''),
          supplierPhone: String(row.supplierPhone || ''),
          quantityPurchased: safeRemoteNumber(row.quantityPurchased),
          unitCostPrice: safeRemoteNumber(row.unitCostPrice),
          totalPurchaseCost: safeRemoteNumber(row.totalPurchaseCost),
          sellingPriceAtPurchase: safeRemoteNumber(row.sellingPriceAtPurchase),
          paymentStatus: String(row.paymentStatus || 'PAID_CASH'),
          invoiceNumber: String(row.invoiceNumber || id),
          branchId: String(row.branchId || 'main_branch'),
          notes: String(row.notes || ''),
          purchaseDate: safeRemoteNumber(row.purchaseDate, now)
        };
        await execute('INSERT INTO purchases(id,product_id,branch_id,total_cents,created_at,data) VALUES(?,?,?,?,?,?)',
          [purchase.id, purchase.productId, purchase.branchId, toCents(purchase.totalPurchaseCost), purchase.purchaseDate, toJson(purchase)], tx);
        changed += 1;
      }

      const transferRows: Record<string, any>[] = Array.isArray(root.stockTransfers) ? root.stockTransfers : [];
      for (const row of transferRows) {
        const id = String(row.id || '');
        if (!id) continue;
        const exists = await first<Row>('SELECT id FROM stock_transfers WHERE id=?', [id], tx);
        if (exists) continue;
        const transfer: StockTransfer = {
          id, transferNumber: String(row.transferNumber || id),
          productId: String(row.productId || ''), productName: String(row.productName || ''),
          fromBranchId: String(row.fromBranchId || ''), fromBranchName: String(row.fromBranchName || ''),
          toBranchId: String(row.toBranchId || ''), toBranchName: String(row.toBranchName || ''),
          quantity: safeRemoteNumber(row.quantity), unit: String(row.unit || 'pcs'),
          costValue: safeRemoteNumber(row.costValueRwf ?? row.costValue),
          status: ['IN_TRANSIT', 'COMPLETED', 'CANCELLED'].includes(String(row.status).toUpperCase())
            ? String(row.status).toUpperCase() as StockTransfer['status'] : 'IN_TRANSIT',
          notes: String(row.notes || ''), transferredBy: String(row.transferredBy || ''),
          receivedBy: String(row.receivedBy || ''),
          transferDate: safeRemoteNumber(row.transferDate, now),
          receivedAt: safeRemoteNumber(row.receivedAt),
          updatedAt: safeRemoteNumber(row.updatedAt, now)
        };
        await execute('INSERT INTO stock_transfers(id,product_id,from_branch_id,to_branch_id,quantity,status,created_at,data) VALUES(?,?,?,?,?,?,?,?)',
          [transfer.id, transfer.productId, transfer.fromBranchId, transfer.toBranchId, transfer.quantity, transfer.status, transfer.transferDate, toJson(transfer)], tx);
        changed += 1;
      }

      const tombstoneRows: Record<string, any>[] = Array.isArray(root.tombstones) ? root.tombstones : [];
      for (const row of tombstoneRows) {
        const tableName = String(row.tableName || '');
        const recordId = String(row.recordId || '');
        const deletedAt = safeRemoteNumber(row.deletedAt);
        if (!tableName || !recordId || !deletedAt) continue;
        const id = String(row.id || (tableName + ':' + recordId));
        allTombstones.set(id, row);
      }

      // Merge only shop-display fields. Plan status, expiry, payment references and
      // all device/security secrets remain controlled by BeBoss Cloud and this device.
      if (remoteProfile.phone && String(remoteProfile.phone).replace(/\D/g, '').slice(-9) !== localPhone) {
        throw new Error('The shop owner phone in a peer snapshot does not match this iPhone.');
      }
      const mergedProfile: ShopProfile = {
        ...profile,
        shopName: String(remoteProfile.shopName || remoteProfile.name || profile.shopName),
        ownerName: String(remoteProfile.name || profile.ownerName),
        address: String(remoteProfile.address || profile.address),
        email: String(remoteProfile.email || profile.email),
        currencyCode: String(remoteProfile.currencyCode || profile.currencyCode),
        currencySymbol: String(remoteProfile.currencySymbol || profile.currencySymbol),
        taxRate: safeRemoteNumber(remoteProfile.taxRate, profile.taxRate),
        receiptHeader: String(remoteProfile.receiptHeader ?? profile.receiptHeader),
        receiptFooter: String(remoteProfile.receiptFooter ?? profile.receiptFooter),
        businessType: String(remoteProfile.businessType || profile.businessType),
        updatedAt: Math.max(profile.updatedAt, safeRemoteNumber(remoteProfile.updatedAt, profile.updatedAt))
      };
      await execute('UPDATE shop_profile SET data=?,updated_at=? WHERE id=1',
        [toJson(mergedProfile), mergedProfile.updatedAt], tx);
    }

    for (const [saleId, sale] of allSales) {
      const linesForSale = remoteSaleLinesBySale.get(saleId);
      if (!linesForSale?.length) continue;
      const currentRow = await first<Row>('SELECT data FROM sales WHERE id=?', [saleId], tx);
      if (!currentRow) continue;
      const currentSale = saleFromRow(currentRow);
      const lineRows = await query<Row>('SELECT data FROM sale_items WHERE sale_id=? ORDER BY id', [saleId], tx);
      const storedLines = lineRows.map(row => fromJson<SaleLine>(row.data));
      await execute('UPDATE sales SET data=? WHERE id=?', [toJson({ ...currentSale, items: storedLines }), saleId], tx);
    }

    for (const [id, row] of allTombstones) {
      const tableName = String(row.tableName || '');
      const recordId = String(row.recordId || '');
      const deletedAt = safeRemoteNumber(row.deletedAt, now);
      const hlc = remoteHlc(row.hlcTimestamp);
      await execute(
        'INSERT OR REPLACE INTO sync_tombstones(id,table_name,record_id,deleted_at,hlc) VALUES(?,?,?,?,?)',
        [id, tableName, recordId, deletedAt, hlc], tx
      );
      if (tableName === 'products') {
        const existing = await first<Row>('SELECT data FROM products WHERE id=?', [recordId], tx);
        if (existing) {
          const product = productFromRow(existing);
          if (product.updatedAt <= deletedAt) {
            await saveProductRow({ ...product, isDeleted: true, updatedAt: deletedAt, syncVersion: product.syncVersion + 1, hlcTimestamp: hlc }, tx);
            changed += 1;
          }
        }
      } else if (tableName === 'customers') {
        const existing = await first<Row>('SELECT data FROM customers WHERE id=?', [recordId], tx);
        if (existing) {
          const customer = customerFromRow(existing);
          if (customer.updatedAt <= deletedAt) {
            await saveCustomerRow({ ...customer, isDeleted: true, updatedAt: deletedAt }, tx);
            changed += 1;
          }
        }
      } else if (tableName === 'branches') {
        const existing = await first<Row>('SELECT data FROM branches WHERE id=?', [recordId], tx);
        if (existing) {
          const branch = branchFromRow(existing);
          if (branch.updatedAt <= deletedAt && !branch.isMainBranch) {
            await saveBranchRow({ ...branch, isActive: false, updatedAt: deletedAt }, tx);
            changed += 1;
          }
        }
      } else if (tableName === 'users') {
        const existing = await first<Row>('SELECT data FROM users WHERE id=?', [recordId], tx);
        if (existing) {
          const staff = staffFromRow(existing);
          if (staff.updatedAt <= deletedAt) {
            const disabled = { ...staff, isActive: false, updatedAt: deletedAt };
            await execute('UPDATE users SET active=0,data=?,updated_at=? WHERE id=?', [toJson(disabled), deletedAt, recordId], tx);
            changed += 1;
          }
        }
      } else if (tableName === 'sales') {
        const existing = await first<Row>('SELECT id FROM sales WHERE id=?', [recordId], tx);
        if (existing) {
          await execute('DELETE FROM sale_items WHERE sale_id=?', [recordId], tx);
          await execute('DELETE FROM sales WHERE id=?', [recordId], tx);
          changed += 1;
        }
      }
    }
    await audit(null, 'CLOUD_SNAPSHOT_MERGED', expectedShopId, changed + ' records merged from authenticated peer snapshots.', tx);
    return changed;
  });
  return merged;
}

export type IosCloudSnapshotPackage = {
  snapshot: Record<string, unknown>;
  outboxIds: string[];
  expectedUpdatedAt: number;
};

/** Capture one complete local state for an authenticated, shop-bound iPhone sync. */
export async function buildIosCloudSnapshot(actor: Staff): Promise<IosCloudSnapshotPackage> {
  requirePermission(actor, 'canSellPOS', 'synchronize shop data');
  const profile = await currentProfile();
  if (!profile) throw new Error('Register this iPhone with the shop before synchronizing.');
  const captured = await transaction(async tx => {
    const [products, customers, sales, saleItems, payments, purchases, transfers, branches, users, tombstones, outbox, version] = await Promise.all([
      query<Row>('SELECT data FROM products ORDER BY id', [], tx),
      query<Row>('SELECT data FROM customers ORDER BY id', [], tx),
      query<Row>('SELECT data FROM sales ORDER BY created_at,id', [], tx),
      query<Row>('SELECT data FROM sale_items ORDER BY sale_id,id', [], tx),
      query<Row>('SELECT data FROM customer_payments ORDER BY created_at,id', [], tx),
      query<Row>('SELECT data FROM purchases ORDER BY created_at,id', [], tx),
      query<Row>('SELECT data FROM stock_transfers ORDER BY created_at,id', [], tx),
      query<Row>('SELECT data FROM branches ORDER BY id', [], tx),
      query<Row>('SELECT data FROM users ORDER BY id', [], tx),
      query<Row>('SELECT table_name,record_id,deleted_at,hlc FROM sync_tombstones ORDER BY deleted_at,id', [], tx),
      query<Row>('SELECT id,table_name FROM sync_outbox WHERE status != "SYNCED" ORDER BY created_at,id LIMIT 5000', [], tx),
      first<Row>('SELECT value FROM app_meta WHERE key=?', ['cloud_snapshot_updated_at'], tx)
    ]);
    return {
      products: products.map(row => productFromRow(row)),
      customers: customers.map(row => customerFromRow(row)),
      sales: sales.map(row => saleFromRow(row)),
      saleItems: saleItems.map(row => fromJson<Row>(row.data)),
      customerPayments: payments.map(row => fromJson<CustomerPayment>(row.data)),
      purchases: purchases.map(row => fromJson<Purchase>(row.data)),
      stockTransfers: transfers.map(row => fromJson<StockTransfer>(row.data)),
      branches: branches.map(row => branchFromRow(row)),
      users: users.map(row => {
        const staff = staffFromRow(row);
        return { ...staff, pinHash: '', passwordHash: '' };
      }),
      tombstones: tombstones.map(row => ({
        tableName: String(row.table_name),
        recordId: String(row.record_id),
        deletedAt: Number(row.deleted_at) || 0,
        hlcTimestamp: String(row.hlc || '0')
      })),
      outboxIds: outbox.map(row => ({ id: String(row.id), tableName: String(row.table_name || '') }))
        .filter(row => !!row.id),
      expectedUpdatedAt: Number(version?.value || 0)
    };
  });
  const timestamp = Date.now();
  return {
    snapshot: {
      metadata: {
        app: 'BeBoss',
        version: 'ios-1.0',
        schemaVersion: 3,
        format: 'beboss_branch_datashare_v3',
        timestamp,
        issuedAt: timestamp,
        expiresAt: timestamp + 30 * 24 * 60 * 60 * 1000,
        nonce: makeId(),
        shopSyncKey: profile.username.trim().toLowerCase() + '_' + profile.phone.replace(/\D/g, '').slice(-9),
        exportedBy: actor.username,
        exportedByRole: actor.role,
        devicePlatform: 'IOS'
      },
      shopProfile: {
        id: profile.id,
        shopName: profile.shopName,
        name: profile.ownerName,
        username: profile.username.trim().toLowerCase(),
        phone: profile.phone,
        email: profile.email || '',
        address: profile.address,
        currencyCode: profile.currencyCode,
        currencySymbol: profile.currencySymbol,
        taxRate: profile.taxRate,
        receiptHeader: profile.receiptHeader,
        receiptFooter: profile.receiptFooter,
        businessType: profile.businessType,
        lastSyncedAt: profile.lastSyncedAt,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt
      },
      products: captured.products,
      customers: captured.customers,
      sales: captured.sales,
      saleItems: captured.saleItems,
      customerPayments: captured.customerPayments,
      purchases: captured.purchases,
      stockTransfers: captured.stockTransfers,
      branches: captured.branches,
      // Non-owner devices do not publish the shop-wide staff directory.
      // The server merges staff records already committed by the primary owner terminal.
      users: actor.role === 'OWNER'
        ? captured.users
        : captured.users.filter(user => user.id === actor.id),
      tombstones: captured.tombstones
    },
    outboxIds: captured.outboxIds
      .filter(item => actor.role === 'OWNER' || item.tableName !== 'users')
      .map(item => item.id),
    expectedUpdatedAt: captured.expectedUpdatedAt
  };
}

export async function markIosOutboxSynced(ids: string[], syncedAt: number, cloudUpdatedAt: number): Promise<void> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  await transaction(async tx => {
    for (let start = 0; start < unique.length; start += 100) {
      const batch = unique.slice(start, start + 100);
      if (!batch.length) continue;
      const placeholders = batch.map(() => '?').join(',');
      await execute(
        'UPDATE sync_outbox SET status="SYNCED",last_error="",updated_at=? WHERE id IN (' + placeholders + ')',
        [syncedAt, ...batch],
        tx
      );
    }
    await execute('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      ['cloud_snapshot_updated_at', String(Math.max(0, cloudUpdatedAt))], tx);
    await execute('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      ['last_cloud_sync_at', String(syncedAt)], tx);
    const row = await first<Row>('SELECT data FROM shop_profile WHERE id=1', [], tx);
    if (row) {
      const current = profileFromRow(row);
      const updated = { ...current, lastSyncedAt: syncedAt };
      await execute('UPDATE shop_profile SET data=?,updated_at=? WHERE id=1', [toJson(updated), current.updatedAt], tx);
    }
  });
}

export async function markIosOutboxFailed(ids: string[], reason: string): Promise<void> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  await transaction(async tx => {
    for (let start = 0; start < unique.length; start += 100) {
      const batch = unique.slice(start, start + 100);
      if (!batch.length) continue;
      const placeholders = batch.map(() => '?').join(',');
      await execute(
        'UPDATE sync_outbox SET status="FAILED",retry_count=retry_count+1,last_error=?,updated_at=? WHERE id IN (' + placeholders + ')',
        [String(reason).slice(0, 1000), Date.now(), ...batch],
        tx
      );
    }
  });
}

export type IosCloudMergeSummary = {
  products: number;
  customers: number;
  branches: number;
  sales: number;
  payments: number;
  purchases: number;
  transfers: number;
  staff: number;
  tombstones: number;
};

function cloudValue(row: Row, camel: string, snake: string, fallback: unknown = ''): any {
  return row[camel] !== undefined && row[camel] !== null
    ? row[camel]
    : row[snake] !== undefined && row[snake] !== null ? row[snake] : fallback;
}
function cloudNumber(row: Row, camel: string, snake: string, fallback = 0): number {
  const value = Number(cloudValue(row, camel, snake, fallback));
  return Number.isFinite(value) ? value : fallback;
}
function cloudString(row: Row, camel: string, snake: string, fallback = ''): string {
  return String(cloudValue(row, camel, snake, fallback) ?? fallback);
}
function cloudRole(value: unknown): Role {
  const role = String(value || '').toUpperCase();
  return role === 'OWNER' || role === 'MANAGER' ? role : 'CASHIER';
}
function cloudVersion(row: Row): { updatedAt: number; hlc: string; version: number; deviceId: string } {
  return {
    updatedAt: cloudNumber(row, 'updatedAt', 'updated_at', cloudNumber(row, 'saleDate', 'sale_date', 0)),
    hlc: cloudString(row, 'hlcTimestamp', 'hlc_timestamp', '0'),
    version: cloudNumber(row, 'syncVersion', 'sync_version', 0),
    deviceId: cloudString(row, 'lastModifiedDeviceId', 'last_modified_device_id', 'CLOUD')
  };
}
function tombstoneIsNewer(item: { deletedAt: number; hlc: string }, updatedAt: number, hlc: string): boolean {
  try {
    const deleted = BigInt(item.hlc || '0');
    const current = BigInt(hlc || '0');
    if (deleted > 0n && current > 0n) return deleted >= current;
  } catch {
    // Fall back to wall-clock timestamps for old records without packed HLC values.
  }
  return item.deletedAt >= updatedAt;
}

/**
 * Merge a server-HMAC-verified full shop snapshot without re-enqueueing remote rows.
 * Existing local credential hashes are retained; cloud staff without local credentials
 * are visible but remain locked until an authorised administrator provisions them.
 */
export async function mergeIosCloudSnapshots(parts: unknown[], actor: Staff): Promise<IosCloudMergeSummary> {
  requirePermission(actor, 'canSellPOS', 'receive synchronized shop data');
  if (!Array.isArray(parts) || parts.length > 100) throw new Error('The cloud returned an invalid snapshot generation set.');
  const snapshots = parts.filter((part): part is Row => !!part && typeof part === 'object' && !Array.isArray(part));
  const rows = {
    products: snapshots.flatMap(part => Array.isArray(part.products) ? part.products : []),
    customers: snapshots.flatMap(part => Array.isArray(part.customers) ? part.customers : []),
    branches: snapshots.flatMap(part => Array.isArray(part.branches) ? part.branches : []),
    sales: snapshots.flatMap(part => Array.isArray(part.sales) ? part.sales : []),
    saleItems: snapshots.flatMap(part => Array.isArray(part.saleItems) ? part.saleItems : []),
    payments: snapshots.flatMap(part => Array.isArray(part.customerPayments) ? part.customerPayments : []),
    purchases: snapshots.flatMap(part => Array.isArray(part.purchases) ? part.purchases : []),
    transfers: snapshots.flatMap(part => Array.isArray(part.stockTransfers) ? part.stockTransfers : []),
    users: snapshots.flatMap(part => Array.isArray(part.users) ? part.users : []),
    tombstones: snapshots.flatMap(part => Array.isArray(part.tombstones) ? part.tombstones : [])
  };
  for (const [key, collection] of Object.entries(rows)) {
    const limit = key === 'saleItems' ? 1000000 : key === 'tombstones' ? 250000 : 500000;
    if (collection.length > limit) throw new Error('The cloud ' + key + ' collection exceeds the safe iPhone merge limit.');
  }

  const summary: IosCloudMergeSummary = {
    products: 0, customers: 0, branches: 0, sales: 0,
    payments: 0, purchases: 0, transfers: 0, staff: 0, tombstones: 0
  };

  await transaction(async tx => {
    const tombstones = new Map<string, { table: string; id: string; deletedAt: number; hlc: string }>();
    for (const raw of rows.tombstones) {
      const table = cloudString(raw, 'tableName', 'table_name');
      const id = cloudString(raw, 'recordId', 'record_id');
      if (!table || !id) continue;
      const key = table + ':' + id;
      const incoming = {
        table, id,
        deletedAt: cloudNumber(raw, 'deletedAt', 'deleted_at', 0),
        hlc: cloudString(raw, 'hlcTimestamp', 'hlc', '0')
      };
      const previous = tombstones.get(key);
      if (!previous || tombstoneIsNewer(incoming, previous.deletedAt, previous.hlc)) tombstones.set(key, incoming);
    }
    const isDeleted = (tables: string[], id: string, updatedAt: number, hlc = '0') => {
      for (const table of tables) {
        const item = tombstones.get(table + ':' + id);
        if (item && tombstoneIsNewer(item, updatedAt, hlc)) return true;
      }
      return false;
    };

    for (const raw of rows.branches) {
      const branch: Branch = {
        id: cloudString(raw, 'id', 'id'),
        name: cloudString(raw, 'name', 'name'),
        code: cloudString(raw, 'code', 'code'),
        locationType: cloudString(raw, 'locationType', 'location_type') === 'WAREHOUSE' ? 'WAREHOUSE' : 'STORE',
        address: cloudString(raw, 'address', 'address'),
        phone: cloudString(raw, 'phone', 'phone'),
        managerName: cloudString(raw, 'managerName', 'manager_name'),
        isMainBranch: raw.isMainBranch === true || raw.is_main_branch === true,
        isActive: raw.isActive !== false && raw.is_active !== false,
        operationalStatus: ['OPEN', 'PAUSED', 'CLOSED'].includes(cloudString(raw, 'operationalStatus', 'operational_status'))
          ? cloudString(raw, 'operationalStatus', 'operational_status') as Branch['operationalStatus'] : 'OPEN',
        notes: cloudString(raw, 'notes', 'notes'),
        createdAt: cloudNumber(raw, 'createdAt', 'created_at', Date.now()),
        updatedAt: cloudNumber(raw, 'updatedAt', 'updated_at', Date.now())
      };
      if (!branch.id || !branch.name || isDeleted(['branches'], branch.id, branch.updatedAt)) continue;
      const old = await first<Row>('SELECT data FROM branches WHERE id=?', [branch.id], tx);
      if (old && branchFromRow(old).updatedAt > branch.updatedAt) continue;
      await saveBranchRow(branch, tx);
      summary.branches++;
    }

    for (const raw of rows.products) {
      const product: Product = {
        id: cloudString(raw, 'id', 'id'),
        name: cloudString(raw, 'name', 'name'),
        category: cloudString(raw, 'category', 'category', 'General'),
        barcode: cloudString(raw, 'barcode', 'barcode'),
        unit: cloudString(raw, 'unit', 'unit', 'pcs'),
        branchId: cloudString(raw, 'branchId', 'branch_id', 'main_branch'),
        costPrice: Math.max(0, cloudNumber(raw, 'costPrice', 'cost_price', 0)),
        sellingPrice: Math.max(0, cloudNumber(raw, 'sellingPrice', 'selling_price', 0)),
        quantityInStock: Math.max(0, cloudNumber(raw, 'quantityInStock', 'quantity_in_stock', cloudNumber(raw, 'stock', 'stock', 0))),
        lowStockThreshold: Math.max(0, cloudNumber(raw, 'lowStockThreshold', 'low_stock_threshold', 0)),
        isDeleted: raw.isDeleted === true || raw.is_deleted === true,
        syncVersion: Math.max(0, cloudNumber(raw, 'syncVersion', 'sync_version', 0)),
        hlcTimestamp: cloudString(raw, 'hlcTimestamp', 'hlc_timestamp', '0'),
        createdAt: cloudNumber(raw, 'createdAt', 'created_at', Date.now()),
        updatedAt: cloudNumber(raw, 'updatedAt', 'updated_at', Date.now())
      };
      if (!product.id || !product.name || product.isDeleted ||
          isDeleted(['products'], product.id, product.updatedAt, product.hlcTimestamp)) continue;
      const old = await first<Row>('SELECT data FROM products WHERE id=?', [product.id], tx);
      if (old) {
        const local = productFromRow(old);
        if (compareHlcVersions(
          { hlc: local.hlcTimestamp, updatedAt: local.updatedAt, version: local.syncVersion, deviceId: 'IOS' },
          { hlc: product.hlcTimestamp, updatedAt: product.updatedAt, version: product.syncVersion, deviceId: 'CLOUD' }
        ) > 0) continue;
      }
      await saveProductRow(product, tx);
      summary.products++;
    }

    for (const raw of rows.customers) {
      const customer: Customer = {
        id: cloudString(raw, 'id', 'id'),
        name: cloudString(raw, 'name', 'name'),
        phone: cloudString(raw, 'phone', 'phone'),
        email: cloudString(raw, 'email', 'email'),
        address: cloudString(raw, 'address', 'address'),
        city: cloudString(raw, 'city', 'city'),
        taxIdOrNin: cloudString(raw, 'taxIdOrNin', 'tax_id_or_nin'),
        category: cloudString(raw, 'category', 'category', 'Regular'),
        creditLimit: Math.max(0, cloudNumber(raw, 'creditLimit', 'credit_limit', 0)),
        notes: cloudString(raw, 'notes', 'notes'),
        debtBalance: Math.max(0, cloudNumber(raw, 'debtBalance', 'debt_balance', 0)),
        isDeleted: raw.isDeleted === true || raw.is_deleted === true,
        createdAt: cloudNumber(raw, 'createdAt', 'created_at', Date.now()),
        updatedAt: cloudNumber(raw, 'updatedAt', 'updated_at', Date.now())
      };
      if (!customer.id || !customer.name || customer.isDeleted ||
          isDeleted(['customers'], customer.id, customer.updatedAt)) continue;
      const old = await first<Row>('SELECT data FROM customers WHERE id=?', [customer.id], tx);
      if (old && customerFromRow(old).updatedAt > customer.updatedAt) continue;
      await saveCustomerRow(customer, tx);
      summary.customers++;
    }

    // A full cloud snapshot never contains PIN/password material. Keep local hashes for
    // users already provisioned on this iPhone, and lock newly imported cloud users.
    for (const raw of rows.users) {
      const id = cloudString(raw, 'id', 'user_id');
      const username = cloudString(raw, 'username', 'username').trim().toLowerCase();
      if (!id || !username || isDeleted(['users'], id, cloudNumber(raw, 'updatedAt', 'updated_at', 0))) continue;
      const existing = await first<Row>('SELECT data FROM users WHERE id=? OR username=? COLLATE NOCASE LIMIT 1', [id, username], tx);
      const role = cloudRole(raw.role);
      if (existing) {
        const local = staffFromRow(existing);
        const updated: Staff = {
          ...local,
          name: cloudString(raw, 'name', 'full_name', local.name),
          phone: cloudString(raw, 'phone', 'phone', local.phone),
          username,
          role,
          branchId: cloudString(raw, 'branchId', 'assigned_branch_id', local.branchId),
          branchName: cloudString(raw, 'branchName', 'assigned_branch_name', local.branchName),
          isActive: raw.isActive === false || raw.is_active === false ? false : true,
          updatedAt: Math.max(local.updatedAt, cloudNumber(raw, 'updatedAt', 'updated_at', Date.now())),
          ...ROLE_PERMISSIONS[role]
        };
        await execute(
          'UPDATE users SET username=?,role=?,branch_id=?,active=?,data=?,updated_at=? WHERE id=?',
          [updated.username, updated.role, updated.branchId, updated.isActive ? 1 : 0, toJson(updated), updated.updatedAt, local.id],
          tx
        );
      } else {
        const created: Staff = {
          id, name: cloudString(raw, 'name', 'full_name', username), username,
          phone: cloudString(raw, 'phone', 'phone'),
          role, branchId: cloudString(raw, 'branchId', 'assigned_branch_id'),
          branchName: cloudString(raw, 'branchName', 'assigned_branch_name'),
          pinHash: '', passwordHash: '', isActive: false,
          createdAt: cloudNumber(raw, 'createdAt', 'created_at', Date.now()),
          updatedAt: cloudNumber(raw, 'updatedAt', 'updated_at', Date.now()),
          lastLoginAt: 0, ...ROLE_PERMISSIONS[role]
        };
        await execute(
          'INSERT INTO users(id,username,role,branch_id,active,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
          [created.id, created.username, created.role, created.branchId, 0, toJson(created), created.createdAt, created.updatedAt],
          tx
        );
      }
      summary.staff++;
    }

    const saleItems = new Map<string, Row[]>();
    for (const line of rows.saleItems) {
      const saleId = cloudString(line, 'saleId', 'sale_id');
      if (!saleId) continue;
      const values = saleItems.get(saleId) || [];
      values.push(line);
      saleItems.set(saleId, values);
    }
    for (const raw of rows.sales) {
      const id = cloudString(raw, 'id', 'id');
      const receipt = cloudString(raw, 'receiptNumber', 'receipt_number');
      const saleDate = cloudNumber(raw, 'saleDate', 'sale_date', Date.now());
      if (!id || !receipt || isDeleted(['sales'], id, saleDate)) continue;
      if (await first<Row>('SELECT id FROM sales WHERE id=? OR receipt_number=? LIMIT 1', [id, receipt], tx)) continue;
      const lineRows: Row[] = saleItems.get(id) || (Array.isArray(raw.items) ? raw.items as Row[] : []);
      const items: SaleLine[] = lineRows.map(line => ({
        id: cloudString(line, 'id', 'id', makeId()),
        saleId: id,
        productId: cloudString(line, 'productId', 'product_id'),
        productName: cloudString(line, 'productName', 'product_name'),
        category: cloudString(line, 'category', 'category', 'General'),
        unit: cloudString(line, 'unit', 'unit', 'pcs'),
        quantitySold: Math.max(0, cloudNumber(line, 'quantitySold', 'quantity_sold', cloudNumber(line, 'quantity', 'quantity', 0))),
        costPriceAtSale: Math.max(0, cloudNumber(line, 'costPriceAtSale', 'cost_price_at_sale', 0)),
        unitPriceAtSale: Math.max(0, cloudNumber(line, 'unitPriceAtSale', 'unit_price_at_sale', 0)),
        subtotal: Math.max(0, cloudNumber(line, 'subtotal', 'subtotal', cloudNumber(line, 'total', 'total', 0))),
        profit: cloudNumber(line, 'profit', 'profit', 0),
        branchId: cloudString(line, 'branchId', 'branch_id', cloudString(raw, 'branchId', 'branch_id', 'main_branch'))
      })).filter(line => !!line.productId && line.quantitySold > 0);
      if (!items.length) continue;
      const sale: Sale = {
        id, receiptNumber: receipt,
        customerId: cloudValue(raw, 'customerId', 'customer_id', null) as string | null,
        customerName: cloudString(raw, 'customerName', 'customer_name', 'Walk-in customer'),
        saleDate,
        totalAmount: Math.max(0, cloudNumber(raw, 'totalAmount', 'total_amount', 0)),
        totalCost: Math.max(0, cloudNumber(raw, 'totalCost', 'total_cost', 0)),
        totalProfit: Math.max(0, cloudNumber(raw, 'totalProfit', 'total_profit', 0)),
        discountAmount: Math.max(0, cloudNumber(raw, 'discountAmount', 'discount_amount', 0)),
        paymentMethod: cloudString(raw, 'paymentMethod', 'payment_method', 'CASH'),
        paymentStatus: (['PAID','PARTIAL','UNPAID'].includes(cloudString(raw, 'paymentStatus', 'payment_status', 'PAID').toUpperCase())
          ? cloudString(raw, 'paymentStatus', 'payment_status', 'PAID').toUpperCase() : 'PAID') as Sale['paymentStatus'],
        amountPaid: Math.max(0, cloudNumber(raw, 'amountPaid', 'amount_paid', 0)),
        paymentBreakdown: Array.isArray(raw.paymentBreakdown) ? raw.paymentBreakdown as Sale['paymentBreakdown'] : undefined,
        notes: cloudString(raw, 'notes', 'notes'),
        branchId: cloudString(raw, 'branchId', 'branch_id', 'main_branch'),
        branchName: cloudString(raw, 'branchName', 'branch_name', 'Main Store'),
        cashierId: cloudString(raw, 'cashierId', 'cashier_id'),
        cashierName: cloudString(raw, 'cashierName', 'cashier_name'),
        items
      };
      await execute(
        'INSERT INTO sales(id,receipt_number,customer_id,branch_id,total_cents,paid_cents,profit_cents,created_at,data) VALUES(?,?,?,?,?,?,?,?,?)',
        [sale.id, sale.receiptNumber, sale.customerId, sale.branchId, toCents(sale.totalAmount), toCents(sale.amountPaid), toCents(sale.totalProfit), sale.saleDate, toJson(sale)],
        tx
      );
      for (const line of items) {
        await execute(
          'INSERT OR IGNORE INTO sale_items(id,sale_id,product_id,quantity,data) VALUES(?,?,?,?,?)',
          [line.id, sale.id, line.productId, line.quantitySold, toJson(line)],
          tx
        );
      }
      summary.sales++;
    }

    for (const raw of rows.payments) {
      const id = cloudString(raw, 'id', 'id');
      const customerId = cloudString(raw, 'customerId', 'customer_id');
      const amount = Math.max(0, cloudNumber(raw, 'amount', 'amount', 0));
      const paymentDate = cloudNumber(raw, 'paymentDate', 'payment_date', Date.now());
      if (!id || !customerId || amount <= 0 ||
          isDeleted(['customer_payments', 'customerPayments'], id, paymentDate) ||
          await first<Row>('SELECT id FROM customer_payments WHERE id=?', [id], tx) ||
          !await first<Row>('SELECT id FROM customers WHERE id=?', [customerId], tx)) continue;
      const payment: CustomerPayment = {
        id, customerId,
        customerName: cloudString(raw, 'customerName', 'customer_name'),
        amount,
        previousDebt: Math.max(0, cloudNumber(raw, 'previousDebt', 'previous_debt', 0)),
        remainingDebt: Math.max(0, cloudNumber(raw, 'remainingDebt', 'remaining_debt', 0)),
        paymentMethod: cloudString(raw, 'paymentMethod', 'payment_method', 'CASH'),
        notes: cloudString(raw, 'notes', 'notes'),
        receiptNumber: cloudString(raw, 'receiptNumber', 'receipt_number'),
        paymentDate,
        recordedBy: cloudString(raw, 'recordedBy', 'recorded_by'),
        branchId: cloudString(raw, 'branchId', 'branch_id', 'main_branch')
      };
      await execute(
        'INSERT INTO customer_payments(id,customer_id,amount_cents,created_at,data) VALUES(?,?,?,?,?)',
        [payment.id, payment.customerId, toCents(payment.amount), payment.paymentDate, toJson(payment)],
        tx
      );
      summary.payments++;
    }

    for (const raw of rows.purchases) {
      const id = cloudString(raw, 'id', 'id');
      const purchaseDate = cloudNumber(raw, 'purchaseDate', 'purchase_date', Date.now());
      if (!id || isDeleted(['purchases'], id, purchaseDate) ||
          await first<Row>('SELECT id FROM purchases WHERE id=?', [id], tx)) continue;
      const purchase: Purchase = {
        id,
        productId: cloudString(raw, 'productId', 'product_id'),
        productName: cloudString(raw, 'productName', 'product_name'),
        supplierName: cloudString(raw, 'supplierName', 'supplier_name'),
        supplierPhone: cloudString(raw, 'supplierPhone', 'supplier_phone'),
        quantityPurchased: Math.max(0, cloudNumber(raw, 'quantityPurchased', 'quantity_purchased', 0)),
        unitCostPrice: Math.max(0, cloudNumber(raw, 'unitCostPrice', 'unit_cost_price', 0)),
        totalPurchaseCost: Math.max(0, cloudNumber(raw, 'totalPurchaseCost', 'total_purchase_cost', 0)),
        sellingPriceAtPurchase: Math.max(0, cloudNumber(raw, 'sellingPriceAtPurchase', 'selling_price_at_purchase', 0)),
        paymentStatus: cloudString(raw, 'paymentStatus', 'payment_status', 'PAID'),
        invoiceNumber: cloudString(raw, 'invoiceNumber', 'invoice_number'),
        branchId: cloudString(raw, 'branchId', 'branch_id', 'main_branch'),
        notes: cloudString(raw, 'notes', 'notes'),
        purchaseDate
      };
      await execute(
        'INSERT INTO purchases(id,product_id,branch_id,total_cents,created_at,data) VALUES(?,?,?,?,?,?)',
        [purchase.id, purchase.productId, purchase.branchId, toCents(purchase.totalPurchaseCost), purchase.purchaseDate, toJson(purchase)],
        tx
      );
      summary.purchases++;
    }

    for (const raw of rows.transfers) {
      const id = cloudString(raw, 'id', 'id');
      const transferDate = cloudNumber(raw, 'transferDate', 'transfer_date', Date.now());
      if (!id || isDeleted(['stock_transfers', 'stockTransfers'], id, cloudNumber(raw, 'updatedAt', 'updated_at', transferDate))) continue;
      const transfer: StockTransfer = {
        id,
        transferNumber: cloudString(raw, 'transferNumber', 'transfer_number'),
        productId: cloudString(raw, 'productId', 'product_id'),
        productName: cloudString(raw, 'productName', 'product_name'),
        fromBranchId: cloudString(raw, 'fromBranchId', 'from_branch_id'),
        fromBranchName: cloudString(raw, 'fromBranchName', 'from_branch_name'),
        toBranchId: cloudString(raw, 'toBranchId', 'to_branch_id'),
        toBranchName: cloudString(raw, 'toBranchName', 'to_branch_name'),
        quantity: Math.max(0, cloudNumber(raw, 'quantity', 'quantity', 0)),
        unit: cloudString(raw, 'unit', 'unit', 'pcs'),
        costValue: Math.max(0, cloudNumber(raw, 'costValue', 'cost_value_rwf', 0)),
        status: (['IN_TRANSIT','COMPLETED','CANCELLED'].includes(cloudString(raw, 'status', 'status').toUpperCase())
          ? cloudString(raw, 'status', 'status').toUpperCase() : 'IN_TRANSIT') as StockTransfer['status'],
        notes: cloudString(raw, 'notes', 'notes'),
        transferredBy: cloudString(raw, 'transferredBy', 'transferred_by'),
        receivedBy: cloudString(raw, 'receivedBy', 'received_by'),
        transferDate,
        receivedAt: cloudNumber(raw, 'receivedAt', 'received_at', 0),
        updatedAt: cloudNumber(raw, 'updatedAt', 'updated_at', transferDate)
      };
      const old = await first<Row>('SELECT data FROM stock_transfers WHERE id=?', [id], tx);
      if (old) {
        const current = fromJson<StockTransfer>(old.data);
        if (current.updatedAt > transfer.updatedAt) continue;
        await execute('UPDATE stock_transfers SET status=?,data=? WHERE id=?', [transfer.status, toJson(transfer), id], tx);
      } else {
        await execute(
          'INSERT INTO stock_transfers(id,product_id,from_branch_id,to_branch_id,quantity,status,created_at,data) VALUES(?,?,?,?,?,?,?,?)',
          [transfer.id, transfer.productId, transfer.fromBranchId, transfer.toBranchId, transfer.quantity, transfer.status, transfer.transferDate, toJson(transfer)],
          tx
        );
      }
      summary.transfers++;
    }

    // Persist tombstones before applying them so deleted data cannot reappear on a retry.
    for (const item of tombstones.values()) {
      const aliases: Record<string, string> = {
        product: 'products', products: 'products',
        customer: 'customers', customers: 'customers',
        branch: 'branches', branches: 'branches',
        user: 'users', users: 'users',
        sale: 'sales', sales: 'sales',
        sale_items: 'sale_items', saleItems: 'sale_items',
        customer_payment: 'customer_payments', customer_payments: 'customer_payments',
        customerPayments: 'customer_payments',
        purchase: 'purchases', purchases: 'purchases',
        stock_transfer: 'stock_transfers', stock_transfers: 'stock_transfers',
        stockTransfers: 'stock_transfers'
      };
      const table = aliases[item.table] || '';
      if (!table) continue;
      const now = Math.max(Date.now(), item.deletedAt);
      const tombstoneId = item.table + ':' + item.id;
      const previous = await first<Row>('SELECT deleted_at,hlc FROM sync_tombstones WHERE id=?', [tombstoneId], tx);
      if (!previous || tombstoneIsNewer(item, Number(previous.deleted_at || 0), String(previous.hlc || '0'))) {
        await execute(
          'INSERT INTO sync_tombstones(id,table_name,record_id,deleted_at,hlc) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET deleted_at=excluded.deleted_at,hlc=excluded.hlc',
          [tombstoneId, table, item.id, now, item.hlc],
          tx
        );
      }
      if (table === 'products') {
        const old = await first<Row>('SELECT data FROM products WHERE id=?', [item.id], tx);
        if (old) {
          const product = productFromRow(old);
          product.isDeleted = true;
          product.updatedAt = Math.max(product.updatedAt, now);
          await saveProductRow(product, tx);
        }
      } else if (table === 'customers') {
        const old = await first<Row>('SELECT data FROM customers WHERE id=?', [item.id], tx);
        if (old) {
          const customer = customerFromRow(old);
          customer.isDeleted = true;
          customer.updatedAt = Math.max(customer.updatedAt, now);
          await saveCustomerRow(customer, tx);
        }
      } else if (table === 'branches') {
        const old = await first<Row>('SELECT data FROM branches WHERE id=?', [item.id], tx);
        if (old) {
          const branch = branchFromRow(old);
          branch.isActive = false;
          branch.updatedAt = Math.max(branch.updatedAt, now);
          await saveBranchRow(branch, tx);
        }
      } else if (table === 'users') {
        const old = await first<Row>('SELECT data FROM users WHERE id=?', [item.id], tx);
        if (old) {
          const user = staffFromRow(old);
          user.isActive = false;
          user.updatedAt = Math.max(user.updatedAt, now);
          await execute('UPDATE users SET active=0,data=?,updated_at=? WHERE id=?', [toJson(user), user.updatedAt, item.id], tx);
        }
      } else {
        await execute('DELETE FROM ' + table + ' WHERE id=?', [item.id], tx);
      }
      summary.tombstones++;
    }

    const remoteProfile = snapshots.find(item => item.shopProfile)?.shopProfile as ShopProfile | undefined;
    const localProfile = await currentProfile();
    if (remoteProfile && localProfile &&
        remoteProfile.username?.trim().toLowerCase() === localProfile.username.trim().toLowerCase() &&
        remoteProfile.phone.replace(/\D/g, '').slice(-9) === localProfile.phone.replace(/\D/g, '').slice(-9)) {
      // Subscription/license and local sync cursors are not overwritten by a portable snapshot.
      const updated: ShopProfile = {
        ...localProfile,
        shopName: remoteProfile.shopName || localProfile.shopName,
        ownerName: remoteProfile.ownerName || localProfile.ownerName,
        address: remoteProfile.address || localProfile.address,
        businessType: remoteProfile.businessType || localProfile.businessType,
        currencyCode: remoteProfile.currencyCode || localProfile.currencyCode,
        currencySymbol: remoteProfile.currencySymbol || localProfile.currencySymbol,
        taxRate: Number.isFinite(remoteProfile.taxRate) ? remoteProfile.taxRate : localProfile.taxRate,
        receiptHeader: remoteProfile.receiptHeader || localProfile.receiptHeader,
        receiptFooter: remoteProfile.receiptFooter || localProfile.receiptFooter,
        updatedAt: Math.max(localProfile.updatedAt, remoteProfile.updatedAt || 0)
      };
      await execute('UPDATE shop_profile SET data=?,updated_at=? WHERE id=1', [toJson(updated), updated.updatedAt], tx);
    }
    await audit(actor, 'IOS_CLOUD_SNAPSHOT_MERGED', actor.id, JSON.stringify(summary), tx);
  });
  return summary;
}

export type VoucherRedemptionResult = {
  planName: string;
  daysAdded: number;
  verifiedAmount: number;
  newExpiry: number;
  fingerprint: string;
};

export async function redeemBB3Voucher(
  voucherInput: string,
  actor: Staff
): Promise<VoucherRedemptionResult> {
  if (!actor.isActive || actor.role !== 'OWNER') {
    throw new Error('Only the registered shop owner can redeem a BB3 subscription voucher.');
  }
  const profile = await currentProfile();
  if (!profile) throw new Error('The registered BeBoss shop profile is missing.');
  const username = profile.username.trim().toLowerCase();
  const phone = profile.phone;
  const now = Date.now();
  const previousClock = await first<Row>('SELECT value FROM app_meta WHERE key=?', ['voucher_clock_highwater_ms']);
  const lastTrustedNow = Number(previousClock?.value || 0);
  if (lastTrustedNow > 0 && now + 5 * 60 * 1000 < lastTrustedNow) {
    throw new Error('The iPhone clock appears to have moved backwards. Connect to BeBoss Cloud and correct the device time before voucher redemption.');
  }
  const trustedNow = Math.max(now, lastTrustedNow);
  const validation = verifyBB3Voucher(voucherInput, username, phone, trustedNow);
  if (!validation.valid) throw new Error(validation.message);

  const existing = await first<Row>('SELECT fingerprint FROM redeemed_vouchers WHERE fingerprint=?', [validation.fingerprint]);
  if (existing) throw new Error('This BB3 voucher has already been redeemed on this iPhone.');
  const tierNames: Record<string, string> = {
    SINGLE: 'Single Store Standard Plan',
    DUAL: 'Dual Branch Plan',
    MULTI: 'Enterprise Multi-Branch Plan',
    ANNUAL: 'Annual VIP Merchant Plan'
  };
  const planName = tierNames[validation.tier] || 'BeBoss ' + validation.tier + ' Plan';
  const activeExpiry = profile.subscriptionExpiresAt > trustedNow && profile.subscriptionStatus !== 'SUSPENDED'
    ? profile.subscriptionExpiresAt : trustedNow;
  const newExpiry = activeExpiry + validation.days * DAY_MS;
  const activeBranches = Math.max(1, (await query<Row>('SELECT data FROM branches WHERE active=1', [])).map(row => branchFromRow(row))
    .filter(branch => branch.operationalStatus === 'OPEN' && branch.locationType !== 'WAREHOUSE').length);
  const activeWorkers = Math.max(1, (await query<Row>('SELECT data FROM users WHERE active=1', [])).length);
  // Android maps BB3's tier to the same one-month branch + staff pricing helper.
  // It intentionally does not add the extra-device fee to the voucher amount display.
  const monthly = calculateSubscriptionQuote(activeBranches, activeWorkers, 1, 1).totalPayable;
  const verifiedAmount = validation.tier === 'ANNUAL' ? monthly * 10 :
    validation.tier === 'MULTI' ? 20000 :
    validation.tier === 'DUAL' ? 10000 : 5000;

  await transaction(async tx => {
    const replay = await first<Row>('SELECT fingerprint FROM redeemed_vouchers WHERE fingerprint=?', [validation.fingerprint], tx);
    if (replay) throw new Error('This BB3 voucher has already been redeemed on this iPhone.');
    const currentRow = await first<Row>('SELECT data FROM shop_profile WHERE id=1', [], tx);
    if (!currentRow) throw new Error('Shop profile is missing.');
    const current = profileFromRow(currentRow);
    const currentExpiry = current.subscriptionExpiresAt > trustedNow && current.subscriptionStatus !== 'SUSPENDED'
      ? current.subscriptionExpiresAt : trustedNow;
    const expiry = currentExpiry + validation.days * DAY_MS;
    const updated: ShopProfile = {
      ...current,
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: expiry,
      lastPaymentRef: validation.code,
      lastPaymentAmount: verifiedAmount,
      lastPaymentDate: trustedNow,
      updatedAt: trustedNow
    };
    await execute('UPDATE shop_profile SET data=?,updated_at=? WHERE id=1', [toJson(updated), trustedNow], tx);
    await execute(
      'INSERT INTO redeemed_vouchers(fingerprint,voucher_code,plan_name,days_added,verified_amount_rwf,redeemed_at) VALUES(?,?,?,?,?,?)',
      [validation.fingerprint, validation.code, planName, validation.days, verifiedAmount, trustedNow],
      tx
    );
    await execute('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      ['voucher_clock_highwater_ms', String(trustedNow)], tx);
    await audit(actor, 'BB3_VOUCHER_REDEEMED', validation.fingerprint,
      planName + ' • ' + validation.days + ' days • expiry ' + new Date(expiry).toISOString(), tx);
  });

  const finalProfile = await currentProfile();
  return {
    planName,
    daysAdded: validation.days,
    verifiedAmount,
    newExpiry: finalProfile?.subscriptionExpiresAt || newExpiry,
    fingerprint: validation.fingerprint
  };
}

export async function listRedeemedVouchers(): Promise<Array<{
  fingerprint: string; voucherCode: string; planName: string; daysAdded: number;
  verifiedAmountRwf: number; redeemedAt: number;
}>> {
  const rows = await query<Row>('SELECT * FROM redeemed_vouchers ORDER BY redeemed_at DESC');
  return rows.map(row => ({
    fingerprint: String(row.fingerprint),
    voucherCode: String(row.voucher_code),
    planName: String(row.plan_name),
    daysAdded: Number(row.days_added) || 0,
    verifiedAmountRwf: Number(row.verified_amount_rwf) || 0,
    redeemedAt: Number(row.redeemed_at) || 0
  }));
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
