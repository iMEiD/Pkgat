import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

export const SCANNER_COOKIE = 'pkgat_scanner';
const MAX_AGE_SECONDS = 60 * 60 * 16; // ١٦ ساعة تغطي ليلة المناسبة كاملة

export interface ScannerSession {
  scannerId: string;
  eventId: string;
  username: string;
  displayName: string;
}

function secret(): Uint8Array {
  const value = process.env.SCANNER_SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error('SCANNER_SESSION_SECRET مطلوب (٣٢ حرفاً على الأقل)');
  }
  return new TextEncoder().encode(value);
}

export async function createScannerToken(session: ScannerSession): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.scannerId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function readScannerToken(token: string): Promise<ScannerSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.scannerId || !payload.eventId) return null;
    return {
      scannerId: String(payload.scannerId),
      eventId: String(payload.eventId),
      username: String(payload.username ?? ''),
      displayName: String(payload.displayName ?? ''),
    };
  } catch {
    return null;
  }
}

export async function setScannerCookie(session: ScannerSession) {
  const token = await createScannerToken(session);
  const store = await cookies();
  store.set(SCANNER_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearScannerCookie() {
  const store = await cookies();
  store.delete(SCANNER_COOKIE);
}

/**
 * جلسة مسؤول المسح الحالية من الكوكي — أو null.
 *
 * لا ترمي عند غياب السرّ: بدون سرّ لا توجد جلسة صالحة أصلاً، والانهيار هنا
 * كان يحوّل صفحة إعداد ناقص إلى خطأ خادم غامض.
 */
export async function getScannerSession(): Promise<ScannerSession | null> {
  if (!process.env.SCANNER_SESSION_SECRET) return null;

  const store = await cookies();
  const token = store.get(SCANNER_COOKIE)?.value;
  if (!token) return null;
  return readScannerToken(token);
}
