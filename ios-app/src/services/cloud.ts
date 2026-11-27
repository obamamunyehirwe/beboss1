import Config from 'react-native-config';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import * as Keychain from 'react-native-keychain';
import QuickCrypto from 'react-native-quick-crypto';

const AUTH_SERVICE = 'rw.beboss.ios.supabase-auth.';
const DEVICE_SERVICE = 'rw.beboss.ios.device-credential';
const DEVICE_ID_SERVICE = 'rw.beboss.ios.device-id';
const url = (Config.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const publicKey = (Config.SUPABASE_PUBLISHABLE_KEY || '').trim();

export type IosDeviceCredential = {
  shopId: string;
  shopName: string;
  ownerUsername: string;
  deviceId: string;
  deviceRecordId: string;
  assignedUserId: string;
  assignedUsername: string;
  assignedUserName: string;
  assignedPhone: string;
  role: 'OWNER' | 'MANAGER' | 'CASHIER';
  branchId: string;
  branchName: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
};

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const item = await Keychain.getGenericPassword({ service: AUTH_SERVICE + key });
    return item ? item.password : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await Keychain.setGenericPassword(key, value, {
      service: AUTH_SERVICE + key,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    });
  },
  async removeItem(key: string): Promise<void> {
    await Keychain.resetGenericPassword({ service: AUTH_SERVICE + key });
  }
};

export const cloudConfigured = url.startsWith('https://') && publicKey.startsWith('sb_publishable_');

export const supabase = cloudConfigured
  ? createClient(url, publicKey, {
      auth: {
        storage: secureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce'
      }
    })
  : null;

let lifecycleSubscription: { remove: () => void } | null = null;

export function startCloudSessionLifecycle(): void {
  if (!supabase || lifecycleSubscription) return;
  if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
  lifecycleSubscription = AppState.addEventListener('change', state => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export function stopCloudSessionLifecycle(): void {
  lifecycleSubscription?.remove();
  lifecycleSubscription = null;
  supabase?.auth.stopAutoRefresh();
}

function normalizedRwandaPhone(phoneInput: string): string {
  const digits = phoneInput.replace(/[^0-9]/g, '');
  const local = digits.length === 9 ? digits
    : digits.startsWith('250') && digits.length === 12 ? digits.slice(3)
    : digits.startsWith('0') && digits.length === 10 ? digits.slice(1)
    : '';
  if (!/^7[0-9]{8}$/.test(local)) throw new Error('Enter the registered Rwanda mobile phone number.');
  return '+250' + local;
}

export async function requestOwnerPhoneVerification(phoneInput: string): Promise<void> {
  if (!supabase) throw new Error('Secure cloud configuration is missing. Add the public Supabase URL and publishable key.');
  const phone = normalizedRwandaPhone(phoneInput);
  const result = await supabase.auth.signInWithOtp({ phone });
  if (result.error) throw new Error(result.error.message);
}

export async function verifyOwnerPhoneCode(phoneInput: string, code: string): Promise<string> {
  if (!supabase) throw new Error('Secure cloud configuration is missing.');
  const phone = normalizedRwandaPhone(phoneInput);
  if (!/^[0-9]{4,8}$/.test(code.trim())) throw new Error('Enter the SMS verification code.');
  const result = await supabase.auth.verifyOtp({ phone, token: code.trim(), type: 'sms' });
  if (result.error || !result.data.session) throw new Error(result.error?.message || 'Owner phone verification did not complete.');
  return result.data.user?.id || '';
}

function makeStableIosDeviceId(rawHex: string): string {
  const hex = rawHex.slice(0, 32).toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error('A secure iPhone device identity could not be generated.');
  const uuid = [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
    hex.slice(16, 20), hex.slice(20, 32)
  ].join('-');
  return 'IOS:' + uuid;
}

export async function getStableIosDeviceId(): Promise<string> {
  const saved = await Keychain.getGenericPassword({ service: DEVICE_ID_SERVICE });
  if (saved !== false && saved.password && /^IOS:[0-9a-f-]{36}$/i.test(saved.password)) return saved.password;
  const created = makeStableIosDeviceId(QuickCrypto.randomBytes(16).toString('hex'));
  await Keychain.setGenericPassword('BeBoss iPhone device identity', created, {
    service: DEVICE_ID_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
  return created;
}

export async function getIosDeviceCredential(): Promise<IosDeviceCredential | null> {
  const stored = await Keychain.getGenericPassword({ service: DEVICE_SERVICE });
  if (stored === false || !stored.password) return null;
  try {
    const value = JSON.parse(stored.password) as IosDeviceCredential;
    if (!value.shopId || !/^IOS:[0-9a-f-]{36}$/i.test(value.deviceId) ||
        !/^[0-9a-f]{64}$/.test(value.accessToken) ||
        !/^[0-9a-f]{64}$/.test(value.refreshToken) ||
        !value.deviceRecordId || !value.assignedUserId || !value.assignedUsername ||
        !['OWNER', 'MANAGER', 'CASHIER'].includes(value.role)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

async function persistDeviceCredential(value: IosDeviceCredential): Promise<void> {
  await Keychain.setGenericPassword('BeBoss enrolled iPhone device', JSON.stringify(value), {
    service: DEVICE_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
}

export async function enrollIosDevice(
  ownerUsernameInput: string,
  ownerPhone: string,
  joinCodeInput: string,
  deviceName = 'BeBoss iPhone'
): Promise<IosDeviceCredential> {
  if (!supabase) throw new Error('Secure cloud configuration is missing.');
  const username = ownerUsernameInput.trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,80}$/.test(username)) throw new Error('Enter the registered owner username.');
  normalizedRwandaPhone(ownerPhone);
  const joinCode = joinCodeInput.trim().toUpperCase();
  if (!/^[A-Z0-9-]{8,100}$/.test(joinCode)) throw new Error('Enter the invitation code issued by the registered owner terminal.');
  const session = await supabase.auth.getSession();
  if (session.error || !session.data.session) {
    throw new Error('Verify the registered owner phone by SMS before pairing this iPhone.');
  }
  if (!session.data.session.user.phone_confirmed_at) {
    throw new Error('The owner phone session is not verified.');
  }
  const deviceId = await getStableIosDeviceId();
  const result = await supabase.functions.invoke('ios-device-auth', {
    body: {
      action: 'enroll',
      username,
      phone: normalizedRwandaPhone(ownerPhone),
      joinCode,
      deviceId,
      deviceName: deviceName.trim().slice(0, 120) || 'BeBoss iPhone'
    }
  });
  if (result.error) {
    const details = (result.error as any).context?.json;
    throw new Error(details?.message || result.error.message || 'The iPhone could not be enrolled.');
  }
  const payload = result.data as IosDeviceCredential & { ok?: boolean };
  if (!payload?.ok || payload.deviceId !== deviceId || !payload.accessToken || !payload.refreshToken ||
      !payload.deviceRecordId || !payload.assignedUserId || !payload.assignedUsername) {
    throw new Error('The server response did not contain a complete iPhone device credential.');
  }
  const credential: IosDeviceCredential = {
    shopId: payload.shopId,
    shopName: payload.shopName,
    ownerUsername: payload.ownerUsername,
    deviceId: payload.deviceId,
    deviceRecordId: payload.deviceRecordId,
    assignedUserId: payload.assignedUserId,
    assignedUsername: String(payload.assignedUsername).trim().toLowerCase(),
    assignedUserName: String(payload.assignedUserName || payload.assignedUsername),
    assignedPhone: String(payload.assignedPhone || ''),
    role: payload.role,
    branchId: payload.branchId || '',
    branchName: payload.branchName || '',
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    accessExpiresAt: payload.accessExpiresAt,
    refreshExpiresAt: payload.refreshExpiresAt
  };
  await persistDeviceCredential(credential);
  return credential;
}

export async function refreshIosDeviceCredential(force = false): Promise<IosDeviceCredential> {
  if (!supabase) throw new Error('Secure cloud configuration is missing.');
  const current = await getIosDeviceCredential();
  if (!current) throw new Error('This iPhone has not been enrolled with a registered owner-issued invitation.');
  if (!force && current.accessExpiresAt > Date.now() + 2 * 60 * 1000) return current;
  if (current.refreshExpiresAt <= Date.now()) throw new Error('The iPhone device credential expired. Ask the owner to issue a new invitation.');
  const result = await supabase.functions.invoke('ios-device-auth', {
    body: {
      action: 'refresh',
      shopId: current.shopId,
      deviceId: current.deviceId,
      refreshToken: current.refreshToken
    }
  });
  if (result.error || !result.data?.ok) {
    const details = (result.error as any)?.context?.json;
    throw new Error(details?.message || result.error?.message || 'The iPhone device credential could not be refreshed.');
  }
  const credential: IosDeviceCredential = {
    ...current,
    accessToken: result.data.accessToken,
    refreshToken: result.data.refreshToken,
    accessExpiresAt: result.data.accessExpiresAt,
    refreshExpiresAt: result.data.refreshExpiresAt
  };
  await persistDeviceCredential(credential);
  return credential;
}

export async function removeIosDeviceCredential(): Promise<void> {
  await Keychain.resetGenericPassword({ service: DEVICE_SERVICE });
}

export async function signOutCloud(): Promise<void> {
  if (!supabase) return;
  const result = await supabase.auth.signOut();
  if (result.error) throw new Error(result.error.message);
}

export async function cloudSessionState(): Promise<{
  configured: boolean; authenticated: boolean; emailOrPhone: string; enrolledDevice: boolean;
}> {
  if (!supabase) return { configured: false, authenticated: false, emailOrPhone: '', enrolledDevice: false };
  const result = await supabase.auth.getSession();
  if (result.error) throw new Error(result.error.message);
  const credential = await getIosDeviceCredential();
  return {
    configured: true,
    authenticated: !!result.data.session,
    emailOrPhone: result.data.session?.user.phone || result.data.session?.user.email || '',
    enrolledDevice: !!credential
  };
}

export type IosCloudSyncStatus = {
  ready: boolean;
  enrolledDevice: boolean;
  role: 'OWNER' | 'MANAGER' | 'CASHIER';
  branchId: string;
  branchName: string;
  canUpload: boolean;
  latestUpdatedAt: number;
  reason: string;
};

type IosCloudSnapshotReply = {
  ok: true;
  latestUpdatedAt: number;
  snapshots: Record<string, unknown>[];
  snapshotCount: number;
};

export type IosCloudUploadResult = {
  uploadedAt: number;
  latestUpdatedAt: number;
  accepted: boolean;
  conflict: boolean;
  message: string;
  chunkCount: number;
};

async function postIosDeviceAction<T extends Record<string, any>>(
  action: string,
  payload: Record<string, unknown> = {},
  retryRefresh = true
): Promise<T> {
  if (!cloudConfigured) throw new Error('Secure cloud configuration is missing.');
  const credential = await refreshIosDeviceCredential();
  const response = await fetch(url + '/functions/v1/ios-device-auth', {
    method: 'POST',
    headers: {
      apikey: publicKey,
      'Content-Type': 'application/json',
      'X-BeBoss-Device-ID': credential.deviceId,
      'X-BeBoss-Device-Token': credential.accessToken
    },
    body: JSON.stringify({ action, ...payload })
  });
  const body = await response.json().catch(() => ({})) as Record<string, any>;
  if (response.status === 401 && retryRefresh) {
    await refreshIosDeviceCredential(true);
    return postIosDeviceAction<T>(action, payload, false);
  }
  if (!response.ok || body.ok !== true) {
    throw new Error(typeof body.message === 'string' ? body.message : 'The secure iPhone cloud request was rejected.');
  }
  return body as T;
}

export async function getIosCloudSyncStatus(): Promise<IosCloudSyncStatus> {
  const credential = await getIosDeviceCredential();
  if (!credential) {
    return {
      ready: false, enrolledDevice: false, role: 'CASHIER', branchId: '', branchName: '',
      canUpload: false, latestUpdatedAt: 0,
      reason: 'Enroll this iPhone with an active owner-issued device invitation first.'
    };
  }
  const reply = await postIosDeviceAction<{
    ok: true; role: IosCloudSyncStatus['role']; branchId: string; branchName: string;
    canUpload: boolean; latestUpdatedAt: number; reason?: string;
  }>('sync_status');
  return {
    ready: true,
    enrolledDevice: true,
    role: reply.role,
    branchId: reply.branchId || '',
    branchName: reply.branchName || '',
    canUpload: reply.canUpload === true,
    latestUpdatedAt: Math.max(0, Number(reply.latestUpdatedAt) || 0),
    reason: reply.reason || 'This enrolled iPhone can securely synchronize its authorized shop data.'
  };
}

export async function uploadIosCloudSnapshot(
  snapshot: Record<string, unknown>,
  expectedUpdatedAt: number
): Promise<IosCloudUploadResult> {
  const reply = await postIosDeviceAction<{
    ok: true; uploadedAt?: number; latestUpdatedAt: number; accepted: boolean;
    conflict?: boolean; message?: string; chunkCount?: number;
  }>('sync_upload', { snapshot, expectedUpdatedAt: Math.max(0, Math.floor(expectedUpdatedAt)) });
  return {
    uploadedAt: Number(reply.uploadedAt) || 0,
    latestUpdatedAt: Number(reply.latestUpdatedAt) || 0,
    accepted: reply.accepted === true,
    conflict: reply.conflict === true,
    message: String(reply.message || ''),
    chunkCount: Math.max(0, Number(reply.chunkCount) || 0)
  };
}

export async function downloadIosCloudSnapshots(): Promise<IosCloudSnapshotReply> {
  const reply = await postIosDeviceAction<IosCloudSnapshotReply>('sync_download');
  if (!Array.isArray(reply.snapshots)) throw new Error('The cloud returned an invalid iPhone snapshot response.');
  return {
    ok: true,
    latestUpdatedAt: Math.max(0, Number(reply.latestUpdatedAt) || 0),
    snapshots: reply.snapshots,
    snapshotCount: Number(reply.snapshotCount) || reply.snapshots.length
  };
}

/** The iPhone sync gate is opened only by the server after the device credential is revalidated. */
export async function requestSecureIosSyncReadiness(): Promise<{
  ready: boolean;
  enrolledDevice: boolean;
  reason: string;
  status?: IosCloudSyncStatus;
}> {
  const state = await cloudSessionState();
  if (!state.configured) {
    return { ready: false, enrolledDevice: false, reason: 'Add the public Supabase project URL and publishable key.' };
  }
  if (!state.authenticated) {
    return { ready: false, enrolledDevice: false, reason: 'Verify the registered shop-owner phone first.' };
  }
  if (!state.enrolledDevice) {
    return {
      ready: false,
      enrolledDevice: false,
      reason: 'Enter an invitation code generated by the registered owner terminal to enroll this iPhone. SMS verification alone is not device authorization.'
    };
  }
  try {
    const status = await getIosCloudSyncStatus();
    return {
      ready: status.ready,
      enrolledDevice: true,
      reason: status.reason,
      status
    };
  } catch (error) {
    return {
      ready: false,
      enrolledDevice: true,
      reason: error instanceof Error ? error.message : 'The iPhone device credential could not be verified.'
    };
  }
}


export function getCloudRestConfiguration(): { url: string; publishableKey: string } {
  if (!cloudConfigured) throw new Error('Secure cloud configuration is missing.');
  return { url, publishableKey: publicKey };
}


export type SubscriptionCheckoutInput = {
  username: string;
  ownerPhone: string;
  payerPhone: string;
  payerName: string;
  payerEmail: string;
  shopName: string;
  months: 1 | 3 | 6 | 12;
  branches: number;
  workers: number;
  devices: number;
  gateway: 'mtn_momo' | 'flutterwave' | 'stripe';
};

export type SubscriptionCheckoutResult = {
  ok: true;
  pending?: boolean;
  paymentRequestId: string;
  provider?: string;
  reference?: string;
  amountRwf: number;
  currency: string;
  status?: string;
  message?: string;
  checkoutUrl?: string;
};

export async function createSubscriptionCheckout(
  input: SubscriptionCheckoutInput
): Promise<SubscriptionCheckoutResult> {
  if (!supabase) throw new Error('BeBoss Cloud is not configured on this iPhone.');
  const session = await supabase.auth.getSession();
  if (session.error || !session.data.session || !session.data.session.user.phone_confirmed_at) {
    throw new Error('Verify the registered shop-owner phone by SMS before creating a subscription payment.');
  }
  if (session.data.session.user.phone?.replace(/\D/g, '').slice(-9) !== input.ownerPhone.replace(/\D/g, '').slice(-9)) {
    throw new Error('The verified SMS session does not match this shop owner phone.');
  }
  const result = await supabase.functions.invoke('create-payment-checkout', {
    body: {
      gateway: input.gateway,
      username: input.username.trim().toLowerCase(),
      phone: input.ownerPhone.trim(),
      payerPhone: input.payerPhone.trim(),
      payerName: input.payerName.trim(),
      payerEmail: input.payerEmail.trim().toLowerCase(),
      shopName: input.shopName.trim(),
      months: input.months,
      branches: input.branches,
      workers: input.workers,
      devices: input.devices
    }
  });
  if (result.error) {
    const context = (result.error as any).context;
    const detail = context?.json || context?.body;
    throw new Error(detail?.message || result.error.message || 'The subscription checkout could not be created.');
  }
  const data = result.data as SubscriptionCheckoutResult;
  if (!data?.ok || !data.paymentRequestId || !Number.isFinite(Number(data.amountRwf))) {
    throw new Error('BeBoss payment service returned an incomplete checkout response.');
  }
  return data;
}

export type SubscriptionPaymentStatus = {
  ok: true;
  pending: boolean;
  verified: boolean;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'REVIEW_REQUIRED' | string;
  message: string;
};

export async function checkSubscriptionPaymentStatus(
  paymentRequestId: string,
  username: string,
  ownerPhone: string
): Promise<SubscriptionPaymentStatus> {
  if (!supabase) throw new Error('BeBoss Cloud is not configured.');
  const session = await supabase.auth.getSession();
  if (session.error || !session.data.session || !session.data.session.user.phone_confirmed_at) {
    throw new Error('A verified owner phone session is required to check payment status.');
  }
  const result = await supabase.functions.invoke('create-payment-checkout', {
    body: {
      action: 'status',
      paymentRequestId: paymentRequestId.trim(),
      username: username.trim().toLowerCase(),
      phone: ownerPhone.trim()
    }
  });
  if (result.error) {
    const context = (result.error as any).context;
    const detail = context?.json || context?.body;
    throw new Error(detail?.message || result.error.message || 'The provider payment status could not be checked.');
  }
  const data = result.data as SubscriptionPaymentStatus;
  if (!data?.ok) throw new Error(data?.message || 'The provider returned no payment status.');
  return data;
}
