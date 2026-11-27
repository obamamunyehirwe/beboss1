import { Buffer } from 'react-native-quick-crypto';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import QuickCrypto from 'react-native-quick-crypto';
import { StoreSnapshot } from '../core/types';

function hex(value: Uint8Array): string {
  return Array.from(value).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function fromHex(value: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2) throw new Error('Backup file is invalid.');
  const out = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) out[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  return out;
}
function base64(value: Uint8Array): string { return Buffer.from(value).toString('base64'); }
function unbase64(value: string): Uint8Array { return new Uint8Array(Buffer.from(value, 'base64')); }

export async function exportEncryptedBackup(snapshot: StoreSnapshot, passphrase: string): Promise<string> {
  if (passphrase.trim().length < 12) throw new Error('Backup password must contain at least 12 characters.');
  const payload = JSON.stringify({
    format: 'beboss_iphone_backup_v1',
    createdAt: new Date().toISOString(),
    shopName: snapshot.profile?.shopName || '',
    profile: snapshot.profile,
    products: snapshot.products,
    customers: snapshot.customers,
    branches: snapshot.branches,
    staff: snapshot.staff.map(user => ({ ...user, pinHash: '', passwordHash: '' })),
    sales: snapshot.sales,
    payments: snapshot.payments,
    purchases: snapshot.purchases,
    transfers: snapshot.transfers,
    redeemedVouchers: snapshot.redeemedVouchers,
    voucherClockHighWaterMs: snapshot.voucherClockHighWaterMs
  });
  const salt = QuickCrypto.randomBytes(16);
  const iv = QuickCrypto.randomBytes(12);
  const key = QuickCrypto.pbkdf2Sync(passphrase.trim(), salt, 210000, 32, 'sha256');
  const cipher = QuickCrypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const envelope = {
    format: 'BEBOSS_ENCRYPTED_BACKUP_V1',
    salt: hex(salt),
    iv: hex(iv),
    tag: hex(cipher.getAuthTag()),
    payload: base64(ciphertext)
  };
  const safeName = (snapshot.profile?.shopName || 'shop').replace(/[^A-Za-z0-9_-]/g, '_');
  const path = RNFS.DocumentDirectoryPath + '/' + safeName + '_backup_' + Date.now() + '.beboss';
  await RNFS.writeFile(path, JSON.stringify(envelope), 'utf8');
  await Share.open({ url: 'file://' + path, type: 'application/octet-stream', title: 'Share encrypted BeBoss backup' });
  return path;
}

export async function decryptBackupFile(path: string, passphrase: string): Promise<any> {
  if (passphrase.trim().length < 12) throw new Error('Backup password must contain at least 12 characters.');
  const content = await RNFS.readFile(path, 'utf8');
  const envelope = JSON.parse(content);
  if (envelope.format !== 'BEBOSS_ENCRYPTED_BACKUP_V1') throw new Error('Unsupported BeBoss backup format.');
  const key = QuickCrypto.pbkdf2Sync(passphrase.trim(), fromHex(envelope.salt), 210000, 32, 'sha256');
  const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', key, fromHex(envelope.iv));
  decipher.setAuthTag(Buffer.from(fromHex(envelope.tag)) as any);
  const plaintext = Buffer.concat([decipher.update(Buffer.from(unbase64(envelope.payload))), decipher.final()]).toString('utf8');
  const data = JSON.parse(plaintext);
  if (data.format !== 'beboss_iphone_backup_v1') throw new Error('The backup contents are not valid.');
  return data;
}
