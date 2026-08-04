import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { clearAdmin2fa } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearAdmin2fa();

  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
