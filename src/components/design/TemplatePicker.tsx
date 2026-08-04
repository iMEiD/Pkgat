'use client';

import { useMemo, useState } from 'react';

import { EmptyState } from '@/components/ui/Misc';
import type { TemplateCategory, TemplateRow } from '@/lib/types/database';
import { cn } from '@/lib/utils/cn';

export function TemplatePicker({
  templates,
  categories,
  selectedId,
  onSelect,
}: {
  templates: TemplateRow[];
  categories: TemplateCategory[];
  selectedId: string | null;
  onSelect: (template: TemplateRow) => void;
}) {
  const [category, setCategory] = useState<string | 'all'>('all');

  const visibleCategories = useMemo(
    () => categories.filter((c) => templates.some((t) => t.category_id === c.id)),
    [categories, templates],
  );

  const filtered = useMemo(
    () => (category === 'all' ? templates : templates.filter((t) => t.category_id === category)),
    [templates, category],
  );

  if (templates.length === 0) {
    return (
      <EmptyState
        icon="🎨"
        title="لا توجد قوالب جاهزة بعد"
        description="يضيف فريق بكجات القوالب من لوحة الأدمن. تقدر ترفع تصميمك الخاص من التبويب الثاني."
      />
    );
  }

  return (
    <div>
      {visibleCategories.length > 0 && (
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 pk-scrollbar">
          <CategoryChip active={category === 'all'} onClick={() => setCategory('all')}>
            الكل
          </CategoryChip>
          {visibleCategories.map((c) => (
            <CategoryChip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
              {c.name}
            </CategoryChip>
          ))}
        </div>
      )}

      <div className="grid max-h-[420px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 pk-scrollbar">
        {filtered.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t)}
            className={cn(
              'group overflow-hidden rounded-2xl border-2 bg-white text-right transition-all duration-200',
              selectedId === t.id
                ? 'border-grape-500 shadow-pop'
                : 'border-sand-200 hover:-translate-y-0.5 hover:border-sand-400 hover:shadow-soft',
            )}
          >
            <span className="block aspect-[3/4] overflow-hidden bg-sand-100">
              {/* صور القوالب من مصادر متعددة — نستخدم img عادي بدل next/image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.thumbnail_url || t.background_url}
                alt={t.name}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </span>
            <span className="block truncate px-2.5 py-2 text-xs font-bold text-ink">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors',
        active ? 'bg-grape-500 text-white' : 'bg-sand-100 text-ink-soft hover:bg-sand-200',
      )}
    >
      {children}
    </button>
  );
}
