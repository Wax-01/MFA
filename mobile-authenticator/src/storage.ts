import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { OtpAccount } from './totp';

// En el celular los secretos van al almacén cifrado del SO (Keychain / Keystore).
// SecureStore no existe en web, así que allí se usa localStorage (solo para pruebas).
const KEY = 'mfa_lab.accounts';

export async function loadAccounts(): Promise<OtpAccount[]> {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveAccounts(accounts: OtpAccount[]): Promise<void> {
  const raw = JSON.stringify(accounts);
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw);
  else await SecureStore.setItemAsync(KEY, raw);
}
