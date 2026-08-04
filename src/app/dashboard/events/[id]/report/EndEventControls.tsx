'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { endEvent, reopenEvent } from '@/lib/actions/events';
import { formatDateTime } from '@/lib/utils/format';

export function EndEventControls({
  eventId,
  isEnded,
  endedAt,
}: {
  eventId: string;
  isEnded: boolean;
  endedAt: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function finish() {
    if (
      !confirm(
        'سيتم إنهاء المناسبة وإيقاف صلاحية كل الباركودات فوراً. أي مدعو لم يدخل بعد لن يقدر يدخل. متأكد؟',
      )
    )
      return;

    setError(null);
    startTransition(async () => {
      const res = await endEvent(eventId);
      if (!res.ok) setError(res.error ?? 'تعذّر الإنهاء.');
      else router.refresh();
    });
  }

  function reopen() {
    setError(null);
    startTransition(async () => {
      const res = await reopenEvent(eventId);
      if (!res.ok) setError(res.error ?? 'تعذّرت إعادة الفتح.');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}

      {isEnded ? (
        <>
          <Alert tone="info" title="المناسبة منتهية">
            {endedAt ? `أُنهيت يدوياً في ${formatDateTime(endedAt)}.` : 'انتهت حسب التوقيت المحدد.'}
          </Alert>
          <Button variant="secondary" onClick={reopen} loading={pending}>
            إعادة فتح المناسبة
          </Button>
        </>
      ) : (
        <Button variant="danger" onClick={finish} loading={pending}>
          إنهاء المناسبة الآن
        </Button>
      )}
    </div>
  );
}
