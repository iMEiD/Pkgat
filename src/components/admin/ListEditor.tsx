'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';

type Item = Record<string, string>;

/** تسميات عربية للحقول الشائعة في قوائم المحتوى */
const FIELD_LABELS: Record<string, string> = {
  title: 'العنوان',
  body: 'النص',
  label: 'الوصف',
  value: 'القيمة',
  icon: 'الأيقونة',
  color: 'اللون',
  q: 'السؤال',
  a: 'الجواب',
};

/** حقول تُعرض كمساحة نص متعددة الأسطر */
const LONG_FIELDS = new Set(['body', 'a', 'description']);

const ICONS = ['palette', 'qr', 'users', 'scan', 'shield', 'chart', 'calendar', 'sparkle'];
const COLORS = ['grape', 'coral', 'mint', 'sky', 'rose', 'sunny'];

/**
 * محرّر قوائم المحتوى بحقول مرتّبة بدل كتابة JSON يدوياً.
 * يستنتج الحقول من العناصر الموجودة، فيعمل مع أي قائمة في الموقع.
 */
export function ListEditor({
  value,
  onChange,
}: {
  value: Item[];
  onChange: (next: Item[]) => void;
}) {
  const [open, setOpen] = useState<number | null>(0);

  // الحقول مستنتجة من كل العناصر حتى لا يضيع حقل موجود في بعضها فقط
  const keys = [...new Set(value.flatMap((item) => Object.keys(item ?? {})))];

  function update(index: number, key: string, fieldValue: string) {
    const next = value.map((item, i) => (i === index ? { ...item, [key]: fieldValue } : item));
    onChange(next);
  }

  function remove(index: number) {
    if (!confirm('حذف هذا العنصر من القائمة؟')) return;
    onChange(value.filter((_, i) => i !== index));
    setOpen(null);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setOpen(target);
  }

  function add() {
    const blank: Item = Object.fromEntries(keys.map((k) => [k, '']));
    onChange([...value, blank]);
    setOpen(value.length);
  }

  return (
    <div className="space-y-2">
      {value.map((item, index) => {
        const heading = item.title || item.q || item.label || item.value || `عنصر ${index + 1}`;
        const expanded = open === index;

        return (
          <div key={index} className="overflow-hidden rounded-2xl border border-sand-200 bg-surface">
            <div className="flex items-center gap-1 p-2">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : index)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-right transition-colors hover:bg-sand-50"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-sand-100 text-[11px] font-bold text-ink-soft">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                  {heading}
                </span>
                <Icon
                  name="plus"
                  className={`h-4 w-4 shrink-0 text-ink-faint transition-transform ${expanded ? 'rotate-45' : ''}`}
                />
              </button>

              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label="تحريك لأعلى"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-faint transition-colors hover:bg-sand-100 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === value.length - 1}
                aria-label="تحريك لأسفل"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-faint transition-colors hover:bg-sand-100 disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label="حذف"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-faint transition-colors hover:bg-coral-50 hover:text-coral-600"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>

            {expanded && (
              <div className="space-y-3 border-t border-sand-100 bg-sand-50/50 p-3">
                {keys.map((key) => (
                  <Field key={key} label={FIELD_LABELS[key] ?? key}>
                    {key === 'icon' || key === 'color' ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(key === 'icon' ? ICONS : COLORS).map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => update(index, key, option)}
                            className={`rounded-xl border-2 px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                              item[key] === option
                                ? 'border-grape-400 bg-grape-50 text-grape-600'
                                : 'border-sand-200 text-ink-soft hover:border-sand-400'
                            }`}
                          >
                            {key === 'icon' ? (
                              <Icon name={option} className="h-4 w-4" />
                            ) : (
                              <span
                                className="block h-4 w-4 rounded-full"
                                style={{ backgroundColor: colorHex(option) }}
                              />
                            )}
                          </button>
                        ))}
                      </div>
                    ) : LONG_FIELDS.has(key) ? (
                      <Textarea
                        value={item[key] ?? ''}
                        onChange={(e) => update(index, key, e.target.value)}
                        rows={3}
                      />
                    ) : (
                      <Input
                        value={item[key] ?? ''}
                        onChange={(e) => update(index, key, e.target.value)}
                      />
                    )}
                  </Field>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <Button type="button" variant="secondary" size="sm" onClick={add} fullWidth>
        <Icon name="plus" className="h-4 w-4" />
        إضافة عنصر
      </Button>
    </div>
  );
}

function colorHex(name: string): string {
  const map: Record<string, string> = {
    grape: '#6D4AFF',
    coral: '#FF6B4A',
    mint: '#17BE94',
    sky: '#2E90FA',
    rose: '#F0518B',
    sunny: '#F5B01B',
  };
  return map[name] ?? '#6D4AFF';
}
