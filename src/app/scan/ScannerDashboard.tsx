'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { LogoMark } from '@/components/ui/Logo';
import { QrCamera } from '@/components/scan/QrCamera';
import { ScanResultCard } from '@/components/scan/ScanResultCard';
import { formatNumber, formatTime } from '@/lib/utils/format';
import type { ScanResponse } from '@/lib/types/database';
import { cn } from '@/lib/utils/cn';

export interface HistoryEntry {
  id: string;
  name: string;
  result: ScanResponse['result'];
  at: string;
}

/** فترة تجاهل نفس الرمز بعد مسحه — تمنع الطلبات المتكررة من الكاميرا */
const REPEAT_COOLDOWN_MS = 2500;

export function ScannerDashboard({
  scannerName,
  eventTitle,
  eventVenue,
  initialStats,
}: {
  scannerName: string;
  eventTitle: string;
  eventVenue: string | null;
  initialStats: { total: number; attended: number };
}) {
  const [stats, setStats] = useState(initialStats);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [paused, setPaused] = useState(false);

  const recentCodes = useRef(new Map<string, number>());

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const submit = useCallback(
    async (code: string, override = false) => {
      if (busy) return;
      setBusy(true);

      try {
        const res = await fetch('/api/scan/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, override }),
        });

        if (res.status === 401) {
          window.location.href = '/scan/login';
          return;
        }

        const data = (await res.json()) as ScanResponse;
        setResult(data);
        setLastCode(code);

        if (data.stats) setStats(data.stats);

        setHistory((prev) =>
          [
            {
              id: `${code}-${Date.now()}`,
              name: data.guest?.name ?? 'باركود غير معروف',
              result: data.result,
              at: new Date().toISOString(),
            },
            ...prev,
          ].slice(0, 30),
        );

        vibrate(data.result);
      } catch {
        setResult({
          ok: false,
          result: 'invalid',
          message: 'تعذّر الاتصال بالخادم — تأكد من الشبكة وأعد المسح.',
        });
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const onDetected = useCallback(
    (code: string) => {
      const now = Date.now();
      const seenAt = recentCodes.current.get(code);
      if (seenAt && now - seenAt < REPEAT_COOLDOWN_MS) return;

      recentCodes.current.set(code, now);
      // ننظّف الرموز القديمة حتى لا تكبر الخريطة طوال الليلة
      for (const [key, time] of recentCodes.current) {
        if (now - time > REPEAT_COOLDOWN_MS * 4) recentCodes.current.delete(key);
      }

      void submit(code);
    },
    [submit],
  );

  return (
    <div className="flex min-h-screen flex-col bg-ink text-white">
      {/* الشريط العلوي */}
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <LogoMark className="h-9 w-9 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{eventTitle}</p>
          <p className="truncate text-[11px] text-white/55">
            {scannerName}
            {eventVenue ? ` · ${eventVenue}` : ''}
          </p>
        </div>
        <form action="/api/scan/logout" method="post">
          <button
            type="submit"
            aria-label="خروج"
            className="grid h-9 w-9 place-items-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Icon name="logout" className="h-5 w-5" />
          </button>
        </form>
      </header>

      {offline && (
        <div className="bg-coral-500 px-4 py-2 text-center text-xs font-bold">
          لا يوجد اتصال بالإنترنت — المسح متوقف حتى ترجع الشبكة.
        </div>
      )}

      {/* العدّاد */}
      <div className="grid grid-cols-3 divide-x divide-x-reverse divide-white/10 border-b border-white/10">
        <Counter label="حضروا" value={stats.attended} tone="text-mint-300" />
        <Counter label="المتبقي" value={Math.max(0, stats.total - stats.attended)} tone="text-white" />
        <Counter label="الإجمالي" value={stats.total} tone="text-white/70" />
      </div>

      {/* الكاميرا */}
      <div className="relative flex-1">
        <QrCamera onDetected={onDetected} paused={paused || busy || manualOpen} />

        {result && (
          <div className="absolute inset-x-0 bottom-0 z-20 p-3">
            <ScanResultCard
              result={result}
              busy={busy}
              onDismiss={() => setResult(null)}
              onOverride={
                lastCode && (result.result === 'duplicate' || result.result === 'inactive' || result.result === 'expired')
                  ? () => submit(lastCode, true)
                  : undefined
              }
            />
          </div>
        )}
      </div>

      {/* أدوات */}
      <div className="border-t border-white/10 p-3">
        {manualOpen ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const code = manualCode.trim();
              if (code) {
                void submit(code);
                setManualCode('');
                setManualOpen(false);
              }
            }}
            className="flex gap-2"
          >
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              dir="ltr"
              autoFocus
              placeholder="الصق رمز الباركود يدوياً"
              className="flex-1 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-white/40"
            />
            <Button type="submit" size="md">
              تحقق
            </Button>
            <Button type="button" variant="ghost" className="text-white/70" onClick={() => setManualOpen(false)}>
              إلغاء
            </Button>
          </form>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPaused((v) => !v)}
              className="flex-1 rounded-2xl border border-white/15 py-3 text-sm font-bold text-white/80 transition-colors hover:bg-white/10"
            >
              {paused ? 'استئناف المسح' : 'إيقاف مؤقت'}
            </button>
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="flex-1 rounded-2xl border border-white/15 py-3 text-sm font-bold text-white/80 transition-colors hover:bg-white/10"
            >
              إدخال يدوي
            </button>
          </div>
        )}
      </div>

      {/* آخر العمليات */}
      {history.length > 0 && (
        <details className="border-t border-white/10">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-white/70">
            آخر عمليات المسح ({history.length})
          </summary>
          <ul className="max-h-56 overflow-y-auto px-4 pb-4">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 border-b border-white/5 py-2 text-sm last:border-0"
              >
                <span className="truncate text-white/85">{entry.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={cn('text-xs font-bold', resultTextClass(entry.result))}>
                    {RESULT_SHORT[entry.result]}
                  </span>
                  <span className="text-[11px] text-white/40">{formatTime(entry.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <p className={cn('font-display text-2xl font-black tabular-nums', tone)}>
        {formatNumber(value)}
      </p>
      <p className="text-[11px] text-white/50">{label}</p>
    </div>
  );
}

const RESULT_SHORT: Record<ScanResponse['result'], string> = {
  granted: 'دخول',
  override: 'تجاوز',
  duplicate: 'مكرر',
  invalid: 'غير صالح',
  inactive: 'غير مفعّل',
  expired: 'منتهي',
};

function resultTextClass(result: ScanResponse['result']): string {
  if (result === 'granted') return 'text-mint-300';
  if (result === 'override') return 'text-sunny-300';
  if (result === 'duplicate') return 'text-coral-300';
  return 'text-white/50';
}

/** اهتزاز مختلف لكل نتيجة — يفيد في القاعات الصاخبة */
function vibrate(result: ScanResponse['result']) {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  if (result === 'granted') navigator.vibrate(60);
  else if (result === 'duplicate') navigator.vibrate([70, 60, 70]);
  else navigator.vibrate([40, 40, 40, 40]);
}
