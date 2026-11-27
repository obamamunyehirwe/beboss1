import * as Keychain from 'react-native-keychain';

const BIOMETRIC_SERVICE = 'rw.beboss.ios.local-unlock';

export async function biometricAvailable(): Promise<string | null> {
  try {
    return await Keychain.getSupportedBiometryType();
  } catch {
    return null;
  }
}

export async function enableBiometricUnlock(): Promise<void> {
  const kind = await biometricAvailable();
  if (!kind) throw new Error('This iPhone does not currently offer Face ID or Touch ID for BeBoss.');
  await Keychain.setGenericPassword('BeBoss local unlock', 'enabled', {
    service: BIOMETRIC_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET
  });
}

export async function requireBiometricUnlock(): Promise<boolean> {
  const kind = await biometricAvailable();
  if (!kind) return false;
  try {
    const result = await Keychain.getGenericPassword({
      service: BIOMETRIC_SERVICE,
      authenticationPrompt: { title: 'Unlock BeBoss', subtitle: 'Verify your identity to open this shop workspace.' }
    });
    return !!result && result.password === 'enabled';
  } catch {
    return false;
  }
}

export async function disableBiometricUnlock(): Promise<void> {
  await Keychain.resetGenericPassword({ service: BIOMETRIC_SERVICE });
}
