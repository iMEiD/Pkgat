'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Field';
import { EmptyState, Stat } from '@/components/ui/Misc';
import { deleteSuggestion, setSuggestionStatus } from '@/lib/actions/suggestions';
import { formatDateTime, formatNumber } from '@/lib/utils/format';
import type { SuggestionRow } from './page';

const CATEGORY_LABELS: Record<string, string> = {
  feature: 'ميزة جديدة',
  bug: 'خلل',
  design: 'تصميم',
  other: 'أخرى',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'جديد',
  reviewed: 'قُرئ',
  done: 'نُفّذ',
  dismissed: 'مستبعد',
};

const STATUS_TONES: Record<string, 'grape' | 'sky' | 'mint' | 'sand'> = {
  new: 'grape',
  reviewed: 'sky',
  done: 'mint',
  dismissed: 'sand',
};

export function SuggestionsInbox({ items }: { items: SuggestionRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((s) => s.status === filter)),
    [items, filter],
  );

  const newCount = items.filter((s) => s.status === 'new').length;

  function changeStatus(id: string, status: string) {
    setError(null);
    startTransition(async () => {
      const res = await setSuggestionStatus(id, status as 'new');
      if (!res.ok) setError(res.error ?? 'تعذّر التحديث.');
      else router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm('حذف هذا الاقتراح نهائياً؟')) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteSuggestion(id);
      if (!res.ok) setError(res.error ?? 'تعذّر الحذف.');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">الاقتراحات</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          ملاحظات المستخدمين مع بيانات تواصلهم — أسرع مصدر لمعرفة ما ينقص المنصة.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="الإجمالي" value={formatNumber(items.length)} tone="grape" />
        <Stat label="جديدة" value={formatNumber(newCount)} tone="coral" />
        <Stat
          label="نُفّذت"
          value={formatNumber(items.filter((s) => s.status === 'done').length)}
          tone="mint"
        />
        <Stat
          label="أخلال مُبلّغة"
          value={formatNumber(items.filter((s) => s.category === 'bug').length)}
          tone="sunny"
        />
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <Select
        aria-label="تصفية"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-xs"
      >
        <option value="all">كل الاقتراحات</option>
        <option value="new">الجديدة فقط</option>
        <option value="reviewed">المقروءة</option>
        <option value="done">المنفّذة</option>
        <option value="dismissed">المستبعدة</option>
      </Select>

      {filtered.length === 0 ? (
        <EmptyState
          icon="💡"
          title="ما فيه اقتراحات"
          description="لما يرسل المستخدمون ملاحظاتهم بتظهر هنا مع بيانات التواصل."
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONES[s.status] ?? 'sand'}>
                    {STATUS_LABELS[s.status] ?? s.status}
                  </Badge>
                  <Badge tone="sand">{CATEGORY_LABELS[s.category] ?? s.category}</Badge>
                  <span className="text-xs text-ink-faint">{formatDateTime(s.created_at)}</span>
                </div>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-8 text-ink">
                {s.message}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-sand-200 pt-3 text-xs text-ink-soft">
                <span className="font-bold text-ink">{s.name || 'بلا اسم'}</span>
                {s.email && (
                  <a href={`mailto:${s.email}`} dir="ltr" className="hover:text-grape-600">
                    {s.email}
                  </a>
                )}
                {s.phone && (
                  <a
                    href={`https://wa.me/${s.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="hover:text-grape-600"
                  >
                    {s.phone}
                  </a>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(['reviewed', 'done', 'dismissed'] as const)
                  .filter((st) => st !== s.status)
                  .map((st) => (
                    <Button
                      key={st}
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => changeStatus(s.id, st)}
                    >
                      {STATUS_LABELS[st]}
                    </Button>
                  ))}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-coral-600"
                  disabled={pending}
                  onClick={() => remove(s.id)}
                >
                  حذف
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
