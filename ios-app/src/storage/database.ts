import * as Keychain from 'react-native-keychain';
import { open } from '@op-engineering/op-sqlite';
import QuickCrypto from 'react-native-quick-crypto';

const DATABASE_NAME = 'beboss_iphone.db';
const KEY_SERVICE = 'rw.beboss.ios.database-key';
let connection: any = null;
let opening: Promise<any> | null = null;

const schema = [
  'CREATE TABLE IF NOT EXISTS shop_profile (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, role TEXT NOT NULL, branch_id TEXT NOT NULL DEFAULT "", active INTEGER NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS branches (id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, barcode TEXT NOT NULL DEFAULT "", category TEXT NOT NULL DEFAULT "General", branch_id TEXT NOT NULL, price_cents INTEGER NOT NULL, cost_cents INTEGER NOT NULL, stock REAL NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, version INTEGER NOT NULL, hlc TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_products_name ON products(name COLLATE NOCASE)',
  'CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)',
  'CREATE INDEX IF NOT EXISTS idx_products_branch ON products(branch_id)',
  'CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT "", debt_cents INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name COLLATE NOCASE)',
  'CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)',
  'CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, receipt_number TEXT NOT NULL UNIQUE, customer_id TEXT, branch_id TEXT NOT NULL, total_cents INTEGER NOT NULL, paid_cents INTEGER NOT NULL, profit_cents INTEGER NOT NULL, created_at INTEGER NOT NULL, data TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at DESC)',
  'CREATE TABLE IF NOT EXISTS sale_items (id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, product_id TEXT NOT NULL, quantity REAL NOT NULL, data TEXT NOT NULL, FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE)',
  'CREATE TABLE IF NOT EXISTS customer_payments (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, created_at INTEGER NOT NULL, data TEXT NOT NULL, FOREIGN KEY(customer_id) REFERENCES customers(id))',
  'CREATE TABLE IF NOT EXISTS purchases (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, branch_id TEXT NOT NULL, total_cents INTEGER NOT NULL, created_at INTEGER NOT NULL, data TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS stock_transfers (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, from_branch_id TEXT NOT NULL, to_branch_id TEXT NOT NULL, quantity REAL NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, data TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS sync_outbox (id TEXT PRIMARY KEY, table_name TEXT NOT NULL, record_id TEXT NOT NULL, operation TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT "PENDING", retry_count INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_outbox_status ON sync_outbox(status, created_at)',
  'CREATE TABLE IF NOT EXISTS sync_tombstones (id TEXT PRIMARY KEY, table_name TEXT NOT NULL, record_id TEXT NOT NULL, deleted_at INTEGER NOT NULL, hlc TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT NOT NULL, details TEXT NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC)',
  'CREATE TABLE IF NOT EXISTS auth_attempts (bucket TEXT PRIMARY KEY, failures INTEGER NOT NULL, blocked_until INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'
];

function asRows<T>(result: any): T[] {
  const rows = result && result.rows;
  if (!rows) return [];
  if (Array.isArray(rows)) return rows as T[];
  if (Array.isArray(rows._array)) return rows._array as T[];
  const output: T[] = [];
  if (typeof rows.length === 'number' && typeof rows.item === 'function') {
    for (let index = 0; index < rows.length; index += 1) output.push(rows.item(index));
  }
  return output;
}

export async function getDatabase(): Promise<any> {
  if (connection) return connection;
  if (opening) return opening;
  opening = (async () => {
    const saved = await Keychain.getGenericPassword({ service: KEY_SERVICE });
    let encryptionKey: string;
    if (saved && saved.password) {
      encryptionKey = saved.password;
    } else {
      encryptionKey = Array.from(QuickCrypto.randomBytes(32)).map(value => value.toString(16).padStart(2, '0')).join('');
      await Keychain.setGenericPassword('BeBoss encrypted database', encryptionKey, {
        service: KEY_SERVICE,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY
      });
    }

    const db = open({ name: DATABASE_NAME, encryptionKey });
    await db.execute('PRAGMA foreign_keys = ON');
    await db.execute('PRAGMA secure_delete = ON');
    await db.execute('PRAGMA cipher_memory_security = ON');
    for (const statement of schema) await db.execute(statement);
    connection = db;
    return db;
  })();

  try {
    return await opening;
  } catch (error) {
    opening = null;
    throw error;
  }
}

export async function execute(sql: string, params: any[] = [], executor?: any): Promise<any> {
  const db = executor || await getDatabase();
  return db.execute(sql, params);
}

export async function query<T>(sql: string, params: any[] = [], executor?: any): Promise<T[]> {
  return asRows<T>(await execute(sql, params, executor));
}

export async function first<T>(sql: string, params: any[] = [], executor?: any): Promise<T | null> {
  const result = await query<T>(sql, params, executor);
  return result.length > 0 ? result[0] : null;
}

export async function transaction<T>(operation: (tx: any) => Promise<T>): Promise<T> {
  const db = await getDatabase();
  return db.transaction(async (tx: any) => operation(tx));
}

export async function databaseHealth(): Promise<{ encrypted: boolean; tables: number }> {
  const db = await getDatabase();
  const result = await db.execute('PRAGMA cipher_version');
  const versionRows = asRows<{ cipher_version?: string }>(result);
  const tableRows = await query<{ name: string }>('SELECT name FROM sqlite_master WHERE type = ?', ['table']);
  return { encrypted: versionRows.length > 0 && !!versionRows[0].cipher_version, tables: tableRows.length };
}
