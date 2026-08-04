'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { createTag, deleteTag, updateTag } from '@/lib/actions/guests';
import { TAG_COLORS } from '@/lib/design/defaults';
import type { EventTag } from '@/lib/types/database';
import { cn } from '@/lib/utils/cn';

export function TagManager({
  eventId,
  tags,
  counts,
}: {
  eventId: string;
  tags: EventTag[];
  counts: Map<string, number>;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0].value);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createTag(eventId, name, color);
      if (!res.ok) {
        setError(res.error ?? 'تعذّر إنشاء الفئة.');
        return;
      }
      setName('');
      router.refresh();
    });
  }

  function remove(tagId: string) {
    startTransition(async () => {
      await deleteTag(tagId, eventId);
      router.refresh();
    });
  }

  function rename(tagId: string, newName: string) {
    startTransition(async () => {
      await updateTag(tagId, eventId, { name: newName });
      setEditing(null);
      router.refresh();
    });
  }

  function recolor(tagId: string, newColor: string) {
    startTransition(async () => {
      await updateTag(tagId, eventId, { color: newColor });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm leading-7 text-ink-soft">
        الفئات تُستخدم لتفصيل نسب الحضور في التقرير — مثلاً «طرف المعرس» مقابل «طرف العروس».
      </p>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="space-y-2">
        {tags.length === 0 ? (
          <p className="rounded-2xl bg-sand-50 p-4 text-center text-sm text-ink-soft">
            ما فيه فئات بعد.
          </p>
        ) : (
          tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center gap-2 rounded-2xl border border-sand-200 bg-white p-3"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: TAG_COLORS.find((c) => c.value === tag.color)?.hex }}
              />

              {editing === tag.id ? (
                <Input
                  autoFocus
                  defaultValue={tag.name}
                  className="py-1.5 text-sm"
                  onBlur={(e) => rename(tag.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') rename(tag.id, e.currentTarget.value);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(tag.id)}
                  className="min-w-0 flex-1 truncate text-right text-sm font-bold text-ink hover:text-grape-600"
                >
                  {tag.name}
                </button>
              )}

              <span className="shrink-0 text-xs text-ink-faint">
                {counts.get(tag.id) ?? 0} مدعو
              </span>

              <div className="flex shrink-0 gap-1">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => recolor(tag.id, c.value)}
                    aria-label={`لون ${c.label}`}
                    className={cn(
                      'h-4 w-4 rounded-full transition-transform hover:scale-125',
                      tag.color === c.value && 'ring-2 ring-ink ring-offset-1',
                    )}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => remove(tag.id)}
                disabled={pending}
                aria-label="حذف الفئة"
                className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-coral-50 hover:text-coral-600"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>

      <form onSubmit={add} className="space-y-3 border-t border-sand-200 pt-5">
        <Field label="فئة جديدة">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: زملاء العمل"
            required
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          {TAG_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              aria-label={c.label}
              className={cn(
                'h-7 w-7 rounded-full transition-transform hover:scale-110',
                color === c.value && 'ring-2 ring-ink ring-offset-2',
              )}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>

        <Button type="submit" loading={pending} disabled={!name.trim()} fullWidth>
          <Icon name="plus" className="h-4 w-4" />
          إضافة الفئة
        </Button>
      </form>
    </div>
  );
}
