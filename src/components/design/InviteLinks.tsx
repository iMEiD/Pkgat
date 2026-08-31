'use client';

import { useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { canvasToBlob, renderInvitation } from '@/lib/design/render';
import type { DesignConfig, GuestState } from '@/lib/types/database';

/**
 * أدوات وضع «تأكيد الحضور».
 *
 * وهي بديل تنزيل الدعوات ZIP، لا إضافة إليه: في هذا الوضع الباركود ليس
 * داخل الصورة، فلا معنى لصورةٍ لكل مدعو — الصورة واحدة، والفرق بين
 * مدعوٍّ وآخر رابطُه.
 */

/** الرابط يُبنى من أصل الصفحة لا من متغيّر بيئة: نطاق المعاينة يختلف عن الإنتاج */
function inviteUrl(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/i/${token}`;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* ================================================================== */

export function InviteDistribution({
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
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * صورة واحدة للجميع: بلا اسمٍ وبلا باركود.
   *
   * والاسم يُترك فارغاً لا يُرسم باسمٍ عيّنة، وإلا خرجت الصورة وفيها
   * «فلان الفلاني» إلى خمسمئة مدعو.
   */
  async function downloadShared() {
    setBusy(true);
    setError(null);
    try {
      const canvas = await renderInvitation({
        design: { ...design, qr: { ...design.qr, visible: false } },
        guestName: '',
        code: '',
      });
      const blob = await canvasToBlob(canvas);

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${eventTitle.replace(/[\\/:*?"<>|]/g, '').trim() || 'دعوة'}.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('تعذّر توليد الصورة. جرّب مرة ثانية.');
    } finally {
      setBusy(false);
    }
  }

  async function copyAll() {
    const lines = guests.map((g) => `${g.name}: ${inviteUrl(g.invite_token)}`);
    setError(null);

    // النسخ يُرفض في سياق غير آمن أو بلا إذن — والصمت هنا يبدو زرّاً معطّلاً
    if (!(await copy(lines.join('\n')))) {
      setError('المتصفح ما سمح بالنسخ. افتح الصفحة من رابط https وجرّب مرة ثانية.');
      return;
    }

    setDone(`نُسخ ${lines.length} رابطاً — الصقها في أي مكان.`);
    setTimeout(() => setDone(null), 3000);
  }

  if (disabled) {
    return (
      <Alert tone="warning" title="توزيع الدعوات غير متاح">
        {disabledReason}
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <p className="rounded-2xl bg-sand-50 px-4 py-3 text-xs leading-6 text-ink-soft">
        الصورة وحدة للكل — أرسلها مع رابط كل مدعو. الرابط هو اللي يفرّق بينهم،
        وباركود المدعو يطلع له فيه بعد ما يأكّد حضوره.
      </p>

      <Button onClick={downloadShared} loading={busy} fullWidth>
        <Icon name="download" className="h-4 w-4" />
        تحميل صورة الدعوة
      </Button>

      <Button variant="secondary" onClick={copyAll} fullWidth disabled={guests.length === 0}>
        <Icon name="copy" className="h-4 w-4" />
        نسخ روابط كل المدعوين
      </Button>

      {done && <Alert tone="success">{done}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}

/* ================================================================== */

/**
 * زرّا المدعو الواحد: نسخ رابطه، وفتح واتساب برسالة جاهزة.
 *
 * وواتساب هنا wa.me لا واجهةَ برمجة: يفتح محادثة المرسِل نفسه بنصٍّ
 * مكتوب، فيرسل هو بضغطة. لا حساب أعمال ولا موافقة قالب ولا تكلفة
 * لكل رسالة — وهي الطريقة الوحيدة العاملة اليوم، وتبقى بعد الآليّ
 * لأن الآليّ يفشل أحياناً لمدعوٍّ واحد.
 */
export function GuestLinkActions({
  guest,
  eventTitle,
  className,
}: {
  guest: GuestState;
  eventTitle: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (await copy(inviteUrl(guest.invite_token))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  const message = `مرحباً ${guest.name}\nنتشرف بدعوتك لحضور ${eventTitle}\nللاطلاع على الدعوة والرد بالحضور:\n${inviteUrl(guest.invite_token)}`;

  // الرقم يُنظّف من كل ما ليس رقماً، ورقم يبدأ بصفر يُحمل على أنه سعودي
  const digits = (guest.phone ?? '').replace(/\D/g, '');
  const intl = digits.startsWith('0') ? `966${digits.slice(1)}` : digits;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={copyLink}
        aria-label="نسخ رابط الدعوة"
        title={copied ? 'تم النسخ' : 'نسخ رابط الدعوة'}
        className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-sand-100 hover:text-grape-600"
      >
        <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
      </button>

      {intl && (
        <a
          href={`https://wa.me/${intl}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="إرسال عبر واتساب"
          title="إرسال عبر واتساب"
          className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-sand-100 hover:text-mint-600"
        >
          <Icon name="whatsapp" className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}
