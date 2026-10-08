import { ApiFailure, post, session } from './api';

export interface DemoSeedSummary { businessDays: number; completed: number; skipped: number; waiting: number }
export interface DemoShop { id: string; name: string; publicId: string }
export interface DemoStart { demo: boolean; expiresAt: string; shop: DemoShop; seed: DemoSeedSummary }
export interface DemoOwner { id: string; email: string; demo?: boolean; demoExpiresAt?: string | null }
export interface DemoSession { csrf: string; owner: DemoOwner | null; demoExpired?: boolean }

export interface DemoState { expiresAt: string | null; expired: boolean }

const expiryKey = 'smartqueue-demo-expires';

function remember(expiresAt: string | null, mode: 'set' | 'clear'): void {
  try {
    if (mode === 'set' && expiresAt) localStorage.setItem(expiryKey, expiresAt);
    else localStorage.removeItem(expiryKey);
  } catch { /* storage may be unavailable */ }
}

/** Opens a fresh, session-bound demo Shop. The server seeds it and marks the session as a demo. */
export async function startDemo(): Promise<DemoStart> {
  const value = await post<DemoStart>('/api/demo/session', {});
  remember(value.expiresAt, 'set');
  return value;
}

/**
 * Reads the demo state from the account session, falling back to the stored expiry so the banner still
 * explains an expired demo after the server revoked the session.
 */
export async function readDemoState(): Promise<DemoState> {
  const value = await session() as unknown as DemoSession;
  let stored: string | null = null;
  try { stored = localStorage.getItem(expiryKey); } catch { /* storage may be unavailable */ }
  if (value.demoExpired) return { expiresAt: null, expired: true };
  if (value.owner?.demo) {
    const expiresAt = value.owner.demoExpiresAt ?? stored;
    remember(expiresAt, 'set');
    return { expiresAt, expired: false };
  }
  if (value.owner) {
    remember(null, 'clear');
    return { expiresAt: null, expired: false };
  }
  if (stored && new Date(stored).getTime() <= Date.now()) return { expiresAt: null, expired: true };
  remember(null, 'clear');
  return { expiresAt: null, expired: false };
}

/** Remaining demo time as a language-neutral HH:MM countdown. */
export function demoCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 60000));
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

export function demoErrorText(failure: unknown, t: (th: string, en: string) => string): string | null {
  const code = failure instanceof ApiFailure ? failure.code : '';
  if (code === 'demo_expired') return t('โหมดสาธิตหมดอายุแล้ว ข้อมูลตัวอย่างถูกลบอัตโนมัติ เริ่มสาธิตใหม่ได้ทันที', 'This demo expired and its sample data was removed automatically. Start a new demo anytime');
  if (code === 'demo_unavailable') return t('เริ่มโหมดสาธิตไม่ได้ในขณะนี้ ลองใหม่อีกครั้ง', 'The demo could not start right now. Try again');
  return null;
}
