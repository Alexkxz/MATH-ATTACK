import { Player } from '../types/maestro';

const password = () => sessionStorage.getItem('maestroPwd') || '';

export async function adminRequest<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Admin-Password', password());
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) throw new Error(data?.error || `Error ${response.status}`);
  return data as T;
}

export function mapPlayer(raw: any): Player {
  return {
    ...raw,
    id: String(raw.id),
    pin: raw.pin || '',
    experience: Number(raw.experiencia ?? raw.experience ?? 0),
    inventory: raw.inventory || {},
    achievements: raw.achievements || [],
  };
}
