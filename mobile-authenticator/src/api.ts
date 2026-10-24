import Constants from 'expo-constants';
import { Platform } from 'react-native';

// En web el backend está en localhost; en el celular (Expo Go) se usa la IP del PC que sirve Metro.
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'web' ? 'http://localhost:8000' : `http://${devHost ?? 'localhost'}:8000`);

export class ApiError extends Error {
  constructor(message: string, public status: number, public runUrl?: string, public code?: string) {
    super(message);
  }
}

type Options = { method?: 'GET' | 'POST'; token?: string; body?: unknown };

export async function api<T>(path: string, { method = 'POST', token, body }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(`No se pudo contactar el backend en ${API_URL}`, 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data.detail;
    const message = typeof d === 'string' ? d : Array.isArray(d) ? d.map((e) => e.msg).join('; ') : d?.message ?? `HTTP ${res.status}`;
    throw new ApiError(message, res.status, d?.prefect_flow_run_url, d?.error);
  }
  return data as T;
}
