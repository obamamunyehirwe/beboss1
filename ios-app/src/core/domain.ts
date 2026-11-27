import QuickCrypto from 'react-native-quick-crypto';

const PBKDF2_ITERATIONS = 210000;
const KEY_LENGTH = 32;
const WEAK_PINS = new Set([
  '1234', '4321', '0000', '1111', '2222', '3333', '4444', '5555',
  '6666', '7777', '8888', '9999', '1212', '2121', '1010', '2580',
  '1379', '0852', '1122', '2211', '0007', '2000'
]);

export function validatePin(pin: string): string | null {
  const value = pin.trim();
  if (!/^[0-9]{4,6}$/.test(value)) return 'PIN must contain 4 to 6 digits.';
  if (new Set(value).size <= 1) return 'PIN cannot repeat the same digit.';
  if ('0123456789'.includes(value) || '9876543210'.includes(value)) return 'Choose a PIN that is not sequential.';
  if (WEAK_PINS.has(value) || value === value.split('').reverse().join('') || new Set(value).size < 3) {
    return 'This PIN is too predictable. Use at least three different digits.';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  const value = password.trim();
  if (value.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value)) {
    return 'Password must contain uppercase and lowercase letters and a number.';
  }
  if (['password1', 'admin123', 'qwerty12', 'beboss123', '12345678a'].includes(value.toLowerCase())) {
    return 'Choose a less common password.';
  }
  return null;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(value => value.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(value: string): Uint8Array {
  if (value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) throw new Error('Invalid credential hash.');
  const output = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) output[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  return output;
}
function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function hashCredential(secret: string): string {
  const clean = secret.trim();
  if (!clean) throw new Error('Credential cannot be blank.');
  const salt = QuickCrypto.randomBytes(16);
  const derived = QuickCrypto.pbkdf2Sync(clean, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
  return 'pbkdf2v2:' + PBKDF2_ITERATIONS + ':' + bytesToHex(salt) + ':' + bytesToHex(derived);
}

/** Android pbkdf2v1 records require a legacy APK pepper kept in Android Keystore. iOS rejects them. */
export function verifyCredential(secret: string, encoded: string): boolean {
  const parts = encoded.split(':');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2v2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 210000 || iterations > 1000000) return false;
  try {
    const salt = hexToBytes(parts[2]);
    const expected = hexToBytes(parts[3]);
    if (salt.length < 16 || salt.length > 64 || expected.length !== KEY_LENGTH) return false;
    const actual = QuickCrypto.pbkdf2Sync(secret.trim(), salt, iterations, KEY_LENGTH, 'sha256');
    return equalBytes(actual, expected);
  } catch {
    return false;
  }
}

function decimalParts(value: number): { negative: boolean; digits: string; scale: number } {
  if (!Number.isFinite(value)) throw new Error('Amount must be finite.');
  let source = value.toString().toLowerCase();
  let negative = false;
  if (source.startsWith('-')) { negative = true; source = source.slice(1); }
  const exponentIndex = source.indexOf('e');
  const exponent = exponentIndex >= 0 ? Number(source.slice(exponentIndex + 1)) : 0;
  const mantissa = exponentIndex >= 0 ? source.slice(0, exponentIndex) : source;
  const pointIndex = mantissa.indexOf('.');
  const fraction = pointIndex >= 0 ? mantissa.length - pointIndex - 1 : 0;
  const digits = mantissa.replace('.', '').replace(/^0+/, '') || '0';
  return { negative: negative && digits !== '0', digits, scale: fraction - exponent };
}
function toScaledInteger(value: number, targetScale: number): bigint {
  const parsed = decimalParts(value);
  const shift = targetScale - parsed.scale;
  let magnitude: bigint;
  if (shift >= 0) {
    if (parsed.digits.length + shift > 19) throw new Error('Amount exceeds the supported currency range.');
    magnitude = BigInt(parsed.digits + '0'.repeat(shift));
  } else {
    const keepLength = parsed.digits.length + shift;
    const whole = keepLength > 0 ? parsed.digits.slice(0, keepLength) : '0';
    magnitude = BigInt(whole || '0');
    if (keepLength >= 0 && keepLength < parsed.digits.length && parsed.digits[keepLength] >= '5') magnitude += 1n;
  }
  return parsed.negative ? -magnitude : magnitude;
}
export function toCents(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const cents = toScaledInteger(value, 2);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount exceeds the supported currency range.');
  return Number(cents);
}
export function multiplyPriceQuantityCents(price: number, quantity: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(quantity) || price <= 0 || quantity <= 0) return 0;
  const a = decimalParts(price);
  const b = decimalParts(quantity);
  const product = BigInt(a.digits) * BigInt(b.digits);
  const shift = 2 - a.scale - b.scale;
  let cents: bigint;
  if (shift >= 0) {
    if (shift > 19) throw new Error('Line total exceeds the supported currency range.');
    cents = product * (10n ** BigInt(shift));
  } else {
    const divisor = 10n ** BigInt(-shift);
    cents = product / divisor;
    if ((product % divisor) * 2n >= divisor) cents += 1n;
  }
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Line total exceeds the supported currency range.');
  return Number(cents);
}
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(toScaledInteger(value, 2)) / 100;
}
export function centsToMoney(value: number): number { return value / 100; }
export function nowHlc(): string { return (BigInt(Date.now()) << 16n).toString(); }
export function tickHlc(previous: string, nowMs = Date.now()): string {
  const last = BigInt(previous || '0');
  const physical = last >> 16n;
  const logical = last & 65535n;
  const now = BigInt(nowMs);
  return (now > physical ? now << 16n : (physical << 16n) | (logical + 1n)).toString();
}
export function compareHlcVersions(
  local: { hlc: string; updatedAt: number; version: number; deviceId: string },
  remote: { hlc: string; updatedAt: number; version: number; deviceId: string }
): number {
  const left = BigInt(local.hlc || '0');
  const right = BigInt(remote.hlc || '0');
  if (left > 0n && right > 0n && left !== right) return right > left ? 1 : -1;
  if (local.updatedAt !== remote.updatedAt) return remote.updatedAt > local.updatedAt ? 1 : -1;
  if (local.version !== remote.version) return remote.version > local.version ? 1 : -1;
  return remote.deviceId.localeCompare(local.deviceId);
}
export function makeId(): string { return bytesToHex(QuickCrypto.randomBytes(16)); }
export function isSubscriptionActive(profile: { subscriptionStatus: string; subscriptionExpiresAt: number }, trustedNow = Date.now()): boolean {
  if (profile.subscriptionStatus === 'SUSPENDED' || profile.subscriptionStatus === 'EXPIRED') return false;
  return trustedNow < profile.subscriptionExpiresAt;
}
