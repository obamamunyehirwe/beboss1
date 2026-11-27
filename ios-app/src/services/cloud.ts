import Config from 'react-native-config';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import * as Keychain from 'react-native-keychain';

const AUTH_SERVICE = 'rw.beboss.ios.supabase-auth.';
const url = (Config.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const publicKey = (Config.SUPABASE_PUBLISHABLE_KEY || '').trim();

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

export async function requestOwnerPhoneVerification(phoneInput: string): Promise<void> {
  if (!supabase) throw new Error('Secure cloud configuration is missing. Add the public Supabase URL and publishable key.');
  const digits = phoneInput.replace(/[^0-9]/g, '');
  const local = digits.startsWith('250') ? digits.slice(-9) : digits.slice(-9);
  if (!/^7[0-9]{8}$/.test(local)) throw new Error('Enter the registered Rwanda mobile phone number.');
  const result = await supabase.auth.signInWithOtp({ phone: '+250' + local });
  if (result.error) throw new Error(result.error.message);
}

export async function verifyOwnerPhoneCode(phoneInput: string, code: string): Promise<string> {
  if (!supabase) throw new Error('Secure cloud configuration is missing.');
  const digits = phoneInput.replace(/[^0-9]/g, '');
  const local = digits.startsWith('250') ? digits.slice(-9) : digits.slice(-9);
  if (!/^7[0-9]{8}$/.test(local)) throw new Error('Enter the registered Rwanda mobile phone number.');
  if (!/^[0-9]{4,8}$/.test(code.trim())) throw new Error('Enter the SMS verification code.');
  const result = await supabase.auth.verifyOtp({ phone: '+250' + local, token: code.trim(), type: 'sms' });
  if (result.error || !result.data.session) throw new Error(result.error?.message || 'Owner phone verification did not complete.');
  return result.data.user?.id || '';
}

export async function signOutCloud(): Promise<void> {
  if (!supabase) return;
  const result = await supabase.auth.signOut();
  if (result.error) throw new Error(result.error.message);
}

export async function cloudSessionState(): Promise<{ configured: boolean; authenticated: boolean; emailOrPhone: string }> {
  if (!supabase) return { configured: false, authenticated: false, emailOrPhone: '' };
  const result = await supabase.auth.getSession();
  if (result.error) throw new Error(result.error.message);
  return {
    configured: true,
    authenticated: !!result.data.session,
    emailOrPhone: result.data.session?.user.phone || result.data.session?.user.email || ''
  };
}

/**
 * Tenant snapshots intentionally remain disabled until BeBoss issues this iOS
 * installation a platform-bound device credential. The existing Android
 * protocol requires X-BeBoss-Device-ID and X-BeBoss-Device-Token after enrollment;
 * an SMS-authenticated user session alone is not a substitute for that credential.
 */
export async function requestSecureIosSyncReadiness(): Promise<{
  ready: false;
  reason: string;
}> {
  const state = await cloudSessionState();
  if (!state.configured) {
    return { ready: false, reason: 'Add the public Supabase project URL and publishable key.' };
  }
  if (!state.authenticated) {
    return { ready: false, reason: 'Verify the registered shop-owner phone first.' };
  }
  return {
    ready: false,
    reason: 'The BeBoss backend must enroll this iPhone and issue its device-bound sync token before tenant snapshots can be uploaded or downloaded. SMS login alone cannot authorize shop data access.'
  };
}
