import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types/database';

export const ADMIN_2FA_COOKIE = 'pkgat_admin_2fa';

export interface SessionUser {
  id: string;
  email: string;
  profile: Profile;
}

/** المستخدم الحالي مع ملفه الشخصي — أو null إن لم يكن مسجّل دخول */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) return null;
  return { id: user.id, email: user.email ?? '', profile: profile as Profile };
}

/** يفرض تسجيل الدخول، ويمنع الحسابات الموقوفة */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const session = await getSessionUser();
  if (!session) {
    redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`);
  }
  if (session.profile.is_suspended) {
    redirect('/suspended');
  }
  return session;
}

/**
 * يفرض صلاحية الأدمن + اجتياز التحقق بخطوتين في هذه الجلسة.
 * الطبقة الثانية مطلوبة لأن لوحة الأدمن تتحكم بالمنصة كاملة.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireUser('/admin');
  if (!session.profile.is_super_admin) {
    redirect('/dashboard');
  }
  if (!(await hasAdmin2fa(session.id))) {
    redirect('/admin/verify');
  }
  return session;
}

function twoFactorSecret(): Uint8Array {
  const value = process.env.ADMIN_SESSION_SECRET ?? process.env.SCANNER_SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET مطلوب (٣٢ حرفاً على الأقل)');
  }
  return new TextEncoder().encode(value);
}

export async function markAdmin2faPassed(userId: string) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(twoFactorSecret());

  const store = await cookies();
  store.set(ADMIN_2FA_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
}

export async function hasAdmin2fa(userId: string): Promise<boolean> {
  const store = await cookies();
  const token = store.get(ADMIN_2FA_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, twoFactorSecret());
    return payload.uid === userId;
  } catch {
    return false;
  }
}

export async function clearAdmin2fa() {
  const store = await cookies();
  store.delete(ADMIN_2FA_COOKIE);
}
