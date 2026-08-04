'use client';

import { useEffect, useRef, useState } from 'react';

import { Spinner } from '@/components/ui/Button';
import { formatTime, CODE_STATE_LABELS } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

export interface FoundGuest {
  id: string;
  name: string;
  code: string;
  state: 'inactive' | 'active' | 'used' | 'expired';
  seats: number;
  checkedInAt: string | null;
}

const STATE_STYLE: Record<string, string> = {
  active: 'bg-mint-500/15 text-mint-300',
  used: 'bg-coral-500/15 text-coral-300',
  inactive: 'bg-white/10 text-white/60',
  expired: 'bg-white/10 text-white/60',
};

/**
 * بحث عن المدعو بالاسم — بديل عملي عن المسح حين يفقد المدعو دعوته
 * أو يتلف الباركود، فلا يُرفض على الباب بلا حل.
 */
export function GuestSearch({
  onPick,
  onClose,
}: {
  onPick: (guest: FoundGuest) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [guests, setGuests] = useState<FoundGuest[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setGuests([]);
      setSearched(false);
      return;
    }

    // مهلة قصيرة قبل الإرسال حتى لا نرهق الشبكة مع كل حرف
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const res = await fetch('/api/scan/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
          signal: controller.signal,
        });
        const data = await res.json();
        setGuests(data.guests ?? []);
        setSearched(true);
      } catch {
        // إلغاء أو انقطاع — نُبقي آخر نتيجة ظاهرة
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          placeholder="اكتب اسم المدعو…"
          className="flex-1 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/35 focus:border-white/40"
        />
        <button
          type="button"
          onClick={onClose}
          className="rounded-2xl border border-white/15 px-4 text-sm font-bold text-white/70 transition-colors hover:bg-white/10"
        >
          إغلاق
        </button>
      </div>

      {loading && (
        <p className="flex items-center justify-center gap-2 py-4 text-sm text-white/60">
          <Spinner /> جاري البحث…
        </p>
      )}

      {!loading && searched && guests.length === 0 && (
        <p className="py-4 text-center text-sm text-white/60">ما فيه مدعو بهذا الاسم.</p>
      )}

      {guests.length > 0 && (
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {guests.map((guest) => (
            <li key={guest.id}>
              <button
                type="button"
                onClick={() => onPick(guest)}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-right transition-colors hover:bg-white/10"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-white">{guest.name}</span>
                  {guest.checkedInAt && (
                    <span className="text-xs text-white/50">
                      دخل الساعة {formatTime(guest.checkedInAt)}
                    </span>
                  )}
                  {guest.seats > 1 && (
                    <span className="text-xs text-white/50"> · {guest.seats} أشخاص</span>
                  )}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold',
                    STATE_STYLE[guest.state] ?? STATE_STYLE.inactive,
                  )}
                >
                  {CODE_STATE_LABELS[guest.state] ?? guest.state}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-center text-[11px] leading-5 text-white/40">
        اضغط على الاسم لتسجيل دخوله — يفيد لو ضاعت الدعوة أو تلف الباركود.
      </p>
    </div>
  );
}
