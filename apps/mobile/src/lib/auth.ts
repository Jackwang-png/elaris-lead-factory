/**
 * 认证会话封装：JWT 只存放于 expo-secure-store（iOS Keychain / Android Keystore）。
 * 明确禁止：AsyncStorage / localStorage / cookie / 普通日志。
 */
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'wanlan_mobile_token';
const PROFILE_KEY = 'wanlan_mobile_profile';

export interface AuthProfile {
  readonly id: string;
  readonly email: string;
  readonly name?: string | null;
  readonly tenantId: string;
  readonly role: string;
}

export async function saveSession(token: string, profile: AuthProfile): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
}

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function getProfile(): Promise<AuthProfile | null> {
  try {
    const raw = await SecureStore.getItemAsync(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as AuthProfile) : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(PROFILE_KEY);
}

/**
 * 会话变化订阅（供 RootLayout 做登录态跳转）。
 * 极简实现：内部仅维护一个监听器集合，不引入额外状态库。
 */
type Listener = (profile: AuthProfile | null) => void;
const listeners = new Set<Listener>();

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function notifySessionChanged(): Promise<void> {
  const profile = await getProfile();
  listeners.forEach((listener) => listener(profile));
}
