'use client';

import { useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';

/** إعادة إرسال رابط التفعيل — الحد الزمني يفرضه Supabase نفسه */
export function ResendConfirmation({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function resend() {
    setState('sending');
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
    setState(error ? 'error' : 'sent');
  }

  return (
    <div className="mt-5 space-y-3">
      {state === 'sent' && <Alert tone="success">أرسلنا الرابط من جديد. تفقّد بريدك.</Alert>}
      {state === 'error' && (
        <Alert tone="danger">
          تعذّر الإرسال — قد تكون طلبته قبل قليل. انتظر دقيقة وحاول مرة أخرى.
        </Alert>
      )}

      <Button onClick={resend} loading={state === 'sending'} fullWidth>
        أعد إرسال رابط التفعيل
      </Button>

      <Button variant="secondary" fullWidth onClick={() => window.location.reload()}>
        فعّلته — حدّث الصفحة
      </Button>
    </div>
  );
}
