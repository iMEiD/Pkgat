'use client';

import { useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ProgressBar } from '@/components/ui/Misc';
import { canvasToBlob, renderInvitation, safeFileName } from '@/lib/design/render';
import type { DesignConfig, GuestState } from '@/lib/types/database';
import { formatNumber } from '@/lib/utils/format';

/**
 * توليد صور الدعوات في المتصفح ثم تحميلها.
 *
 * التوليد محلي (Client-side) عمداً: يوفّر تكلفة الخادم، ويعطي المستخدم
 * تقدّماً مرئياً، ويستخدم نفس مسار الرسم المستخدم في المعاينة — فالنتيجة
 * مطابقة لما شافه تماماً، بنفس الخط.
 */
export function DownloadInvitations({
  design,
  guests,
  eventTitle,
  disabled,
  disabledReason,
}: {
  design: DesignConfig;
  guests: GuestState[];
  eventTitle: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function downloadZip() {
    if (guests.length === 0) return;
    setError(null);
    setProgress(0);

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const folder = zip.folder(sanitize(eventTitle)) ?? zip;

      for (let i = 0; i < guests.length; i++) {
        const guest = guests[i];
        const canvas = await renderInvitation({
          design,
          guestName: guest.name,
          code: guest.code,
        });
        const blob = await canvasToBlob(canvas);
        folder.file(safeFileName(guest.name, i), blob);
        setProgress(Math.round(((i + 1) / guests.length) * 100));

        // نترك المتصفح يتنفس حتى لا تتجمد الواجهة مع القوائم الطويلة
        if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0));
      }

      const archive = await zip.generateAsync({ type: 'blob' }, (meta) =>
        setProgress(Math.round(meta.percent)),
      );
      triggerDownload(archive, `${sanitize(eventTitle)}-الدعوات.zip`);
    } catch {
      setError('تعذّر توليد الملف المضغوط. جرّب عدداً أقل أو أعد المحاولة.');
    } finally {
      setProgress(null);
    }
  }

  if (disabled) {
    return (
      <Alert tone="warning" title="تحميل الدعوات غير متاح">
        {disabledReason}
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <Button onClick={downloadZip} disabled={progress !== null || guests.length === 0} fullWidth>
        <Icon name="download" className="h-4 w-4" />
        تحميل كل الدعوات ({formatNumber(guests.length)}) كملف ZIP
      </Button>

      {progress !== null && (
        <div className="space-y-1.5">
          <ProgressBar value={progress} max={100} tone="grape" />
          <p className="text-center text-xs text-ink-soft">
            جاري التوليد… {progress}٪ — لا تغلق الصفحة.
          </p>
        </div>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}

/** تحميل دعوة مدعو واحد */
export function DownloadSingle({
  design,
  guest,
  className,
}: {
  design: DesignConfig;
  guest: GuestState;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const canvas = await renderInvitation({ design, guestName: guest.name, code: guest.code });
      const blob = await canvasToBlob(canvas);
      triggerDownload(blob, safeFileName(guest.name, 0));
    } catch {
      // تجاهل — الزر يعود لحالته وبإمكان المستخدم إعادة المحاولة
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy || !design.backgroundUrl}
      title={design.backgroundUrl ? 'تحميل الدعوة' : 'أكمل التصميم أولاً'}
      className={className}
    >
      <Icon name="download" className="h-4 w-4" />
    </button>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // نمهل المتصفح لبدء التحميل قبل تحرير الرابط
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || 'دعوات';
}
