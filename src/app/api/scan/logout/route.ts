import { NextResponse, type NextRequest } from 'next/server';

import { clearScannerCookie } from '@/lib/auth/scanner-session';

export async function POST(request: NextRequest) {
  await clearScannerCookie();
  return NextResponse.redirect(new URL('/scan/login', request.url), { status: 303 });
}
