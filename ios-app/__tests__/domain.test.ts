import {
  centsToMoney, compareHlcVersions, hashCredential, isSubscriptionActive,
  multiplyPriceQuantityCents, tickHlc, toCents, validatePassword, validatePin,
  verifyCredential
} from '../src/core/domain';

describe('BeBoss portable money rules', () => {
  it('converts displayed currency values to minor units using decimal rounding', () => {
    expect(toCents(125.45)).toBe(12545);
    expect(toCents(0.005)).toBe(1);
    expect(toCents(-1)).toBe(0);
    expect(centsToMoney(98765)).toBe(987.65);
  });
  it('multiplies price by quantity before rounding the line total', () => {
    expect(multiplyPriceQuantityCents(12.35, 3)).toBe(3705);
    expect(multiplyPriceQuantityCents(0.1, 0.2)).toBe(2);
  });
});

describe('BeBoss staff credential policy', () => {
  it('rejects weak PINs and passwords', () => {
    expect(validatePin('1234')).toBeTruthy();
    expect(validatePin('7777')).toBeTruthy();
    expect(validatePassword('password1')).toBeTruthy();
    expect(validatePin('5829')).toBeNull();
    expect(validatePassword('RetailBoss2026')).toBeNull();
  });
  it('writes a portable Android-compatible pbkdf2v2 hash', () => {
    const encoded = hashCredential('RetailBoss2026');
    expect(encoded.startsWith('pbkdf2v2:210000:')).toBe(true);
    expect(verifyCredential('RetailBoss2026', encoded)).toBe(true);
    expect(verifyCredential('WrongPassword2026', encoded)).toBe(false);
    expect(verifyCredential('RetailBoss2026', 'pbkdf2:210000:old-salt:old-hash')).toBe(false);
  });
});

describe('BeBoss HLC and subscription rules', () => {
  it('orders later logical ticks after a device clock does not advance', () => {
    const first = tickHlc('0', 1000);
    const second = tickHlc(first, 1000);
    expect(BigInt(second)).toBeGreaterThan(BigInt(first));
  });
  it('uses deterministic timestamp/version/device tie-breakers', () => {
    expect(compareHlcVersions(
      { hlc: '0', updatedAt: 100, version: 1, deviceId: 'a' },
      { hlc: '0', updatedAt: 100, version: 2, deviceId: 'b' }
    )).toBeGreaterThan(0);
  });
  it('does not permit locally expired or suspended access', () => {
    expect(isSubscriptionActive({ subscriptionStatus: 'TRIAL', subscriptionExpiresAt: 2000 }, 1000)).toBe(true);
    expect(isSubscriptionActive({ subscriptionStatus: 'TRIAL', subscriptionExpiresAt: 1000 }, 1000)).toBe(false);
    expect(isSubscriptionActive({ subscriptionStatus: 'SUSPENDED', subscriptionExpiresAt: 3000 }, 1000)).toBe(false);
  });
});
