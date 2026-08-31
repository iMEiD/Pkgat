'use client';

import QRCode from 'qrcode';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';

import { respondAction } from './actions';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { renderInvitation } from '@/lib/design/render';
import type { InviteView as Invite } from '@/lib/data/invite';
import type { RsvpStatus } from '@/lib/types/database';
import { arabicDigits, formatDate, formatTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

export interface InviteCopy {
  confirmTitle: string;
  confirmBody: string;
  declineTitle: string;
  declineBody: string;
  noteLabel: string;
  footerEnabled: boolean;
  footerText: string;
  footerCta: string;
}

export function InviteView({
  token,
  invite,
  copy,
}: {
  token: string;
  invite: Invite;
  copy: InviteCopy;
}) {
  const [status, setStatus] = useState<RsvpStatus>(invite.status);
  const [code, setCode] = useState<string | null>(invite.code);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(Boolean(invite.note));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function respond(next: 'confirmed' | 'declined', withNote: string | null) {
    setError(null);
    startTransition(async () => {
      const res = await respondAction(token, next, withNote);
      if (!res.ok) {
        setError(res.error ?? 'صار خلل مؤقت.');
        return;
      }
      setStatus(res.status ?? next);
      setCode(res.code ?? null);
      if (withNote) {
        setNote('');
        setNoteSaved(true);
      }
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-4 px-4 py-5">
      <header className="flex items-center justify-between">
        <ThemeToggle />
        <span className="text-xs text-ink-soft">دعوة خاصة</span>
      </header>

      <InvitationImage design={invite.event.design} guestName={invite.guestName} />

      <section className="pk-panel rounded-3xl border border-sand-200 bg-surface/85 p-5 text-center shadow-soft">
        <p className="text-xs text-ink-soft">دعوة خاصة إلى</p>
        <p className="mt-1 text-xl font-bold text-ink">{invite.guestName}</p>
        {invite.seats > 1 && (
          <p className="mt-1 text-sm text-ink-soft">
            ومعك {arabicDigits(invite.seats - 1)} مرافق
          </p>
        )}
      </section>

      {invite.checkedIn ? (
        <Notice tone="ok" title="تم تسجيل دخولك" body="نتشرف بحضورك." />
      ) : status === 'pending' ? (
        <AskPanel pending={pending} onRespond={respond} />
      ) : status === 'confirmed' ? (
        <>
          <Notice tone="ok" title={copy.confirmTitle} body={copy.confirmBody} />
          {code && <GuestQr code={code} />}
        </>
      ) : (
        <Notice tone="muted" title={copy.declineTitle} body={copy.declineBody} />
      )}

      {error && (
        <p className="rounded-2xl bg-coral-50 px-4 py-3 text-center text-sm text-coral-700">
          {error}
        </p>
      )}

      {/*
        تغيير الرد مسموح ما لم يُسجَّل الدخول: الظروف تنقلب بين الدعوة
        والمناسبة، ومنعُ التغيير لا يمنع الغياب — يمنع أن يعرفه المنظّم.
      */}
      {!invite.checkedIn && status !== 'pending' && (
        <button
          type="button"
          disabled={pending}
          onClick={() => respond(status === 'confirmed' ? 'declined' : 'confirmed', null)}
          className="mx-auto text-sm font-semibold text-ink-soft underline underline-offset-4 transition-colors hover:text-ink disabled:opacity-50"
        >
          {status === 'confirmed' ? 'تراجع واعتذر عن الحضور' : 'تراجع وأكّد حضورك'}
        </button>
      )}

      {!invite.checkedIn && status !== 'pending' && !noteSaved && (
        <NoteBox
          label={copy.noteLabel}
          value={note}
          onChange={setNote}
          pending={pending}
          onSend={() => note.trim() && respond(status === 'confirmed' ? 'confirmed' : 'declined', note)}
        />
      )}

      <EventDetails event={invite.event} />

      <Countdown target={invite.event.starts_at} />

      {copy.footerEnabled && (
        <footer className="mt-auto pt-2 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-sand-200 bg-surface/70 px-4 py-2 text-xs text-ink-soft transition-colors hover:text-ink"
          >
            <span>{copy.footerText}</span>
            <span className="font-bold text-grape-600">{copy.footerCta} ←</span>
          </Link>
        </footer>
      )}
    </main>
  );
}

/* ================================================================== */

function AskPanel({
  pending,
  onRespond,
}: {
  pending: boolean;
  onRespond: (status: 'confirmed' | 'declined', note: string | null) => void;
}) {
  return (
    <section className="pk-panel rounded-3xl border border-sand-200 bg-surface/85 p-5 shadow-soft">
      <p className="text-center text-sm text-ink-soft">نتشرف بردّك على الدعوة</p>
      <div className="mt-4 grid gap-3">
        <Button
          variant="success"
          size="lg"
          fullWidth
          disabled={pending}
          onClick={() => onRespond('confirmed', null)}
        >
          سأحضر
        </Button>
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          disabled={pending}
          onClick={() => onRespond('declined', null)}
        >
          أعتذر عن الحضور
        </Button>
      </div>
    </section>
  );
}

function Notice({
  tone,
  title,
  body,
}: {
  tone: 'ok' | 'muted';
  title: string;
  body: string;
}) {
  return (
    <section
      className={cn(
        'pk-panel rounded-3xl border p-5 text-center shadow-soft',
        tone === 'ok'
          ? 'border-mint-200 bg-mint-50/80'
          : 'border-sand-200 bg-surface/85',
      )}
    >
      <p className={cn('text-lg font-bold', tone === 'ok' ? 'text-mint-700' : 'text-ink')}>
        {title}
      </p>
      <p className="mt-1 text-sm text-ink-soft">{body}</p>
    </section>
  );
}

function NoteBox({
  label,
  value,
  onChange,
  pending,
  onSend,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  pending: boolean;
  onSend: () => void;
}) {
  return (
    <section className="pk-panel rounded-3xl border border-sand-200 bg-surface/85 p-5 shadow-soft">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="اكتب كلمتك هنا…"
        className="mt-3 w-full resize-none rounded-2xl border border-sand-200 bg-surface px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-grape-400"
      />
      <Button
        variant="outline"
        fullWidth
        className="mt-3"
        disabled={pending || !value.trim()}
        onClick={onSend}
      >
        إرسال
      </Button>
    </section>
  );
}

function EventDetails({ event }: { event: Invite['event'] }) {
  return (
    <section className="pk-panel rounded-3xl border border-sand-200 bg-surface/85 p-5 shadow-soft">
      <h2 className="text-sm font-bold text-ink">تفاصيل المناسبة</h2>
      <dl className="mt-3 grid gap-2 text-sm">
        <Row label="المناسبة" value={event.title} />
        {event.venue && <Row label="المكان" value={event.venue} />}
        <Row label="التاريخ" value={formatDate(event.starts_at)} />
        <Row label="الوقت" value={formatTime(event.starts_at)} />
      </dl>

      {event.note && (
        <p className="mt-3 whitespace-pre-line rounded-2xl bg-sand-50 px-4 py-3 text-sm text-ink-soft">
          {event.note}
        </p>
      )}

      {event.map_url && (
        <a
          href={event.map_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-sand-300 text-sm font-semibold text-ink transition-colors hover:bg-sand-100"
        >
          <Icon name="location" className="h-4 w-4" />
          افتح الموقع على الخريطة
        </a>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-ink-soft">{label}</dt>
      <dd className="text-left font-semibold text-ink">{value}</dd>
    </div>
  );
}

/* ================================================================== */

/**
 * صورة الدعوة تُرسم في المتصفح لا على الخادم.
 *
 * والباركود مطفأ هنا دائماً — حتى بعد التأكيد. لأنه إن رُسم داخل
 * الصورة صار حجمه تابعاً لتصميمها، وقد يقع فوق زخرفة أو لونٍ فاتح،
 * فيتردّد ماسحُ الباب على مدخل القاعة. وهو يُعرض تحتها منفصلاً:
 * أبيض على أسود، بحجمٍ واحدٍ لا يتغيّر.
 */
function InvitationImage({
  design,
  guestName,
}: {
  design: Invite['event']['design'];
  guestName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;

    renderInvitation(
      {
        design: { ...design, qr: { ...design.qr, visible: false } },
        guestName,
        code: '',
      },
      canvasRef.current ?? undefined,
    ).catch(() => {
      if (alive) setFailed(true);
    });

    return () => {
      alive = false;
    };
  }, [design, guestName]);

  // تعذّر الرسم (خطّ لم يصل، صورة لم تُحمّل) — الخلفية وحدها أفضل من فراغ
  if (failed) {
    return design.backgroundUrl ? (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={design.backgroundUrl}
        alt="الدعوة"
        className="w-full rounded-3xl border border-sand-200 shadow-soft"
      />
    ) : null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-3xl border border-sand-200 bg-sand-50 shadow-soft"
      style={{ aspectRatio: `${design.width || 1080} / ${design.height || 1920}` }}
    />
  );
}

/**
 * الباركود بأعلى تصحيحٍ للأخطاء وهامشٍ أبيض واسع: يُمسح من شاشة جوّال
 * مشروخة، تحت إضاءة قاعة، بكاميرا جهازٍ آخر.
 */
function GuestQr({ code }: { code: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    QRCode.toCanvas(canvas, code, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 560,
      color: { dark: '#000000', light: '#FFFFFF' },
    }).catch(() => undefined);
  }, [code]);

  return (
    <section className="pk-panel rounded-3xl border border-sand-200 bg-surface/85 p-5 text-center shadow-soft">
      <div className="mx-auto w-full max-w-[260px] rounded-2xl bg-white p-3">
        <canvas ref={canvasRef} className="h-auto w-full" />
      </div>
      <p className="mt-3 text-xs text-ink-soft">يُمسح مرة واحدة عند الدخول</p>
    </section>
  );
}

/**
 * العدّاد يبدأ فارغاً ويُملأ بعد التركيب.
 *
 * لأنه لو حُسب على الخادم لظهر رقمُ لحظةِ البناء، ثم قفز عند أول
 * تحديث — وهذا فرقٌ بين ما رسمه الخادم وما رسمه المتصفح يشتكي منه
 * React بصوتٍ عالٍ في السجل.
 */
function Countdown({ target }: { target: string }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const end = new Date(target).getTime();
    const tick = () => setLeft(Math.max(0, end - Date.now()));

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  if (left === null || left === 0) return null;

  const s = Math.floor(left / 1000);
  const parts = [
    { label: 'يوم', value: Math.floor(s / 86400) },
    { label: 'ساعة', value: Math.floor((s % 86400) / 3600) },
    { label: 'دقيقة', value: Math.floor((s % 3600) / 60) },
    { label: 'ثانية', value: s % 60 },
  ];

  return (
    <section className="pk-panel rounded-3xl border border-sand-200 bg-surface/85 p-5 shadow-soft">
      <p className="text-center text-xs text-ink-soft">الوقت المتبقي للمناسبة</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {parts.map((p) => (
          <div key={p.label} className="rounded-2xl bg-sand-50 py-3 text-center">
            <div className="font-display text-xl font-bold tabular-nums text-ink">
              {arabicDigits(String(p.value).padStart(2, '0'))}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-soft">{p.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
