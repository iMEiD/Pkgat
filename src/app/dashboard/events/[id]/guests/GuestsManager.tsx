'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ProgressBar, Stat } from '@/components/ui/Misc';
import { DownloadInvitations, DownloadSingle } from '@/components/design/DownloadInvitations';
import { AddGuestsPanel } from './AddGuestsPanel';
import { TagManager } from './TagManager';
import { assignTag, deleteGuests, resetGuestCheckin, updateGuest } from '@/lib/actions/guests';
import { CODE_STATE_LABELS, formatDateTime, formatNumber } from '@/lib/utils/format';
import type { EventRow, EventTag, GuestState } from '@/lib/types/database';
import { cn } from '@/lib/utils/cn';

export function GuestsManager({
  event,
  guests,
  tags,
  limit,
}: {
  event: EventRow;
  guests: GuestState[];
  tags: EventTag[];
  limit: number | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [editing, setEditing] = useState<GuestState | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tagMap = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of guests) {
      if (g.tag_id) counts.set(g.tag_id, (counts.get(g.tag_id) ?? 0) + 1);
    }
    return counts;
  }, [guests]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guests.filter((g) => {
      if (q && !g.name.toLowerCase().includes(q) && !(g.phone ?? '').includes(q)) return false;
      if (tagFilter === 'none' && g.tag_id) return false;
      if (tagFilter !== 'all' && tagFilter !== 'none' && g.tag_id !== tagFilter) return false;
      if (stateFilter !== 'all' && g.code_state !== stateFilter) return false;
      return true;
    });
  }, [guests, query, tagFilter, stateFilter]);

  const attended = guests.filter((g) => g.checked_in_at).length;
  const remaining = limit === null ? null : Math.max(0, limit - guests.length);
  const atLimit = remaining === 0;
  const hasDesign = Boolean(event.design?.backgroundUrl);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((g) => g.id)),
    );
  }

  function bulkAssign(tagId: string | null) {
    startTransition(async () => {
      await assignTag([...selected], tagId, event.id);
      setSelected(new Set());
      router.refresh();
    });
  }

  function bulkDelete() {
    if (!confirm(`سيتم حذف ${selected.size} مدعو نهائياً مع باركوداتهم. متأكد؟`)) return;
    startTransition(async () => {
      await deleteGuests([...selected], event.id);
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* الأرقام والحدود */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="إجمالي المدعوين" value={formatNumber(guests.length)} tone="sky" />
        <Stat label="حضروا" value={formatNumber(attended)} tone="mint" />
        <Stat
          label={limit === null ? 'الحد المسموح' : 'المتبقي من الحد'}
          value={limit === null ? 'غير محدود' : formatNumber(remaining ?? 0)}
          hint={limit === null ? undefined : `من أصل ${formatNumber(limit)}`}
          tone={atLimit ? 'coral' : 'sunny'}
        />
      </div>

      {limit !== null && (
        <div className="space-y-1.5">
          <ProgressBar value={guests.length} max={limit} tone={atLimit ? 'coral' : 'grape'} />
          {atLimit && (
            <Alert
              tone="warning"
              title={event.is_paid ? 'وصلت لحد باقتك' : 'استهلكت دعواتك المجانية'}
              action={
                <ButtonLink href={`/dashboard/billing?event=${event.id}`} size="sm">
                  {event.is_paid ? 'ترقية الباقة' : 'فعّل الباقة'}
                </ButtonLink>
              }
            >
              لإضافة مدعوين جدد وتفعيل باركوداتهم وقت المناسبة، فعّل الباقة المناسبة.
            </Alert>
          )}
        </div>
      )}

      {paymentNotice && (
        <Alert
          tone="warning"
          title="تحتاج تفعيل الباقة"
          action={
            <ButtonLink href={`/dashboard/billing?event=${event.id}`} size="sm">
              اذهب للدفع
            </ButtonLink>
          }
        >
          {paymentNotice}
        </Alert>
      )}

      {!hasDesign && (
        <Alert
          tone="info"
          title="التصميم غير مكتمل"
          action={
            <ButtonLink href={`/dashboard/events/${event.id}/design`} size="sm" variant="secondary">
              اذهب للتصميم
            </ButtonLink>
          }
        >
          تقدر تضيف المدعوين الآن، لكن تحميل صور الدعوات يحتاج خلفية تصميم أولاً.
        </Alert>
      )}

      {/* أدوات */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setAddOpen(true)} disabled={atLimit && !event.is_paid}>
          <Icon name="plus" className="h-4 w-4" />
          إضافة مدعوين
        </Button>
        <Button variant="secondary" onClick={() => setTagsOpen(true)}>
          <Icon name="settings" className="h-4 w-4" />
          إدارة الفئات ({tags.length})
        </Button>
      </div>

      {/* تحميل الدعوات */}
      {guests.length > 0 && (
        <Card>
          <CardHeader
            title="توزيع الدعوات"
            description="حمّل صور الدعوات وأرسلها للمدعوين عبر واتساب."
          />
          <CardBody>
            <DownloadInvitations
              design={event.design}
              guests={guests}
              eventTitle={event.title}
              disabled={!hasDesign}
              disabledReason="أكمل تصميم الدعوة أولاً حتى نقدر نولّد الصور."
            />
          </CardBody>
        </Card>
      )}

      {/* القائمة */}
      <Card>
        <CardHeader
          title={`قائمة المدعوين (${formatNumber(filtered.length)})`}
          description="اضغط على اسم المدعو لتعديله."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو الجوال…"
            />
            <Select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              <option value="all">كل الفئات</option>
              <option value="none">بدون فئة</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
              <option value="all">كل الحالات</option>
              <option value="inactive">غير مفعّل</option>
              <option value="active">صالح</option>
              <option value="used">مستخدم (حضر)</option>
              <option value="expired">منتهي</option>
            </Select>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-grape-50 p-3">
              <span className="text-sm font-bold text-grape-700">
                {formatNumber(selected.size)} محدد
              </span>
              <div className="flex-1" />
              <Select
                className="w-auto py-2 text-sm"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value === '') return;
                  bulkAssign(e.target.value === 'none' ? null : e.target.value);
                  e.target.value = '';
                }}
              >
                <option value="">إسناد فئة…</option>
                <option value="none">بدون فئة</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="danger" onClick={bulkDelete} loading={pending}>
                حذف
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                إلغاء التحديد
              </Button>
            </div>
          )}

          {guests.length === 0 ? (
            <EmptyState
              icon="👥"
              title="ما فيه مدعوين بعد"
              description="أضف مدعوين يدوياً، أو الصق قائمة أسماء، أو استورد ملف Excel."
              action={<Button onClick={() => setAddOpen(true)}>إضافة مدعوين</Button>}
            />
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-soft">لا نتائج مطابقة للبحث.</p>
          ) : (
            <>
              {/* الجوال: بطاقات — الجدول يتطلب تمريراً أفقياً غير مريح */}
              <ul className="space-y-2 sm:hidden">
                {filtered.map((guest) => {
                  const tag = guest.tag_id ? tagMap.get(guest.tag_id) : null;
                  return (
                    <li
                      key={guest.id}
                      className={cn(
                        'rounded-2xl border border-sand-200 p-3.5 transition-colors',
                        selected.has(guest.id) ? 'border-grape-300 bg-grape-50/60' : 'bg-surface',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selected.has(guest.id)}
                          onChange={() => toggle(guest.id)}
                          aria-label={`تحديد ${guest.name}`}
                          className="mt-1 h-5 w-5 shrink-0 accent-grape-500"
                        />

                        <button
                          type="button"
                          onClick={() => setEditing(guest)}
                          className="min-w-0 flex-1 text-right"
                        >
                          <span className="block truncate font-semibold text-ink">
                            {guest.name}
                            {guest.seats > 1 && (
                              <span className="mr-1.5 text-xs font-normal text-ink-faint">
                                ({guest.seats} أشخاص)
                              </span>
                            )}
                          </span>
                          {guest.phone && (
                            <span className="mt-0.5 block text-xs text-ink-faint" dir="ltr">
                              {guest.phone}
                            </span>
                          )}
                        </button>

                        <DownloadSingle
                          design={event.design}
                          guest={guest}
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-faint transition-colors hover:bg-sand-100 hover:text-grape-600 disabled:opacity-40"
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-sand-100 pt-3">
                        <StatusBadge
                          status={guest.code_state}
                          label={CODE_STATE_LABELS[guest.code_state] ?? guest.code_state}
                        />
                        {tag && <Badge tone={tag.color}>{tag.name}</Badge>}
                        {guest.checked_in_at && (
                          <span className="text-xs text-ink-soft">
                            دخل {formatDateTime(guest.checked_in_at)}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* الشاشات الأكبر: جدول كامل */}
              <div className="hidden overflow-x-auto pk-scrollbar sm:block">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-sand-200 text-right text-xs text-ink-faint">
                    <th className="w-10 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.size === filtered.length && filtered.length > 0}
                        onChange={toggleAll}
                        aria-label="تحديد الكل"
                        className="h-4 w-4 accent-grape-500"
                      />
                    </th>
                    <th className="py-2.5 font-semibold">الاسم</th>
                    <th className="py-2.5 font-semibold">الفئة</th>
                    <th className="py-2.5 font-semibold">حالة الباركود</th>
                    <th className="py-2.5 font-semibold">وقت الدخول</th>
                    <th className="w-20 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((guest) => {
                    const tag = guest.tag_id ? tagMap.get(guest.tag_id) : null;
                    return (
                      <tr
                        key={guest.id}
                        className={cn(
                          'border-b border-sand-100 transition-colors hover:bg-sand-50',
                          selected.has(guest.id) && 'bg-grape-50/50',
                        )}
                      >
                        <td className="py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(guest.id)}
                            onChange={() => toggle(guest.id)}
                            aria-label={`تحديد ${guest.name}`}
                            className="h-4 w-4 accent-grape-500"
                          />
                        </td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => setEditing(guest)}
                            className="text-right font-semibold text-ink hover:text-grape-600"
                          >
                            {guest.name}
                          </button>
                          {guest.seats > 1 && (
                            <span className="mr-2 text-xs text-ink-faint">
                              ({guest.seats} أشخاص)
                            </span>
                          )}
                          {guest.phone && (
                            <span className="block text-xs text-ink-faint" dir="ltr">
                              {guest.phone}
                            </span>
                          )}
                        </td>
                        <td className="py-3">
                          {tag ? (
                            <Badge tone={tag.color}>{tag.name}</Badge>
                          ) : (
                            <span className="text-xs text-ink-faint">—</span>
                          )}
                        </td>
                        <td className="py-3">
                          <StatusBadge
                            status={guest.code_state}
                            label={CODE_STATE_LABELS[guest.code_state] ?? guest.code_state}
                          />
                        </td>
                        <td className="py-3 text-xs text-ink-soft">
                          {guest.checked_in_at ? formatDateTime(guest.checked_in_at) : '—'}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center justify-end gap-1">
                            <DownloadSingle
                              design={event.design}
                              guest={guest}
                              className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-sand-100 hover:text-grape-600 disabled:opacity-40"
                            />
                            <button
                              type="button"
                              onClick={() => setEditing(guest)}
                              aria-label="تعديل"
                              className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-sand-100 hover:text-ink"
                            >
                              <Icon name="edit" className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <p className="text-center text-xs text-ink-faint">
        الإرسال التلقائي عبر واتساب ميزة قادمة — حالياً حمّل الصور وأرسلها بنفسك.{' '}
        <Link href={`/dashboard/events/${event.id}/scanners`} className="font-bold text-grape-600">
          جهّز مسؤولي المسح ←
        </Link>
      </p>

      {/* النوافذ */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="إضافة مدعوين"
        description="اختر الطريقة المناسبة لك."
        size="lg"
      >
        <AddGuestsPanel
          eventId={event.id}
          tags={tags}
          onDone={() => router.refresh()}
          onPaymentRequired={(msg) => {
            setPaymentNotice(msg);
            setAddOpen(false);
          }}
        />
      </Modal>

      <Modal open={tagsOpen} onClose={() => setTagsOpen(false)} title="فئات المدعوين">
        <TagManager eventId={event.id} tags={tags} counts={tagCounts} />
      </Modal>

      {editing && (
        <EditGuestModal
          guest={editing}
          tags={tags}
          eventId={event.id}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EditGuestModal({
  guest,
  tags,
  eventId,
  onClose,
}: {
  guest: GuestState;
  tags: EventTag[];
  eventId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(guest.name);
  const [phone, setPhone] = useState(guest.phone ?? '');
  const [tagId, setTagId] = useState(guest.tag_id ?? '');
  const [seats, setSeats] = useState(guest.seats);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateGuest(guest.id, eventId, {
        name,
        phone: phone || null,
        tagId: tagId || null,
        seats,
      });
      if (!res.ok) {
        setError(res.error ?? 'تعذّر الحفظ.');
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function reset() {
    startTransition(async () => {
      await resetGuestCheckin(guest.id, eventId);
      onClose();
      router.refresh();
    });
  }

  function remove() {
    if (!confirm('سيُحذف المدعو وباركوده نهائياً. متأكد؟')) return;
    startTransition(async () => {
      await deleteGuests([guest.id], eventId);
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="تعديل المدعو"
      footer={
        <>
          <Button variant="ghost" onClick={remove} className="text-coral-600">
            حذف
          </Button>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={save} loading={pending}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <Field label="الاسم" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="رقم الجوال">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
          </Field>
          <Field label="عدد الأشخاص">
            <Input
              type="number"
              min={1}
              max={50}
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
            />
          </Field>
        </div>

        <Field label="الفئة">
          <Select value={tagId} onChange={(e) => setTagId(e.target.value)}>
            <option value="">بدون فئة</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="rounded-2xl bg-sand-50 p-4">
          <p className="text-xs font-bold text-ink-faint">حالة الباركود</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <StatusBadge
              status={guest.code_state}
              label={CODE_STATE_LABELS[guest.code_state] ?? guest.code_state}
            />
            {guest.checked_in_at && (
              <>
                <span className="text-xs text-ink-soft">
                  دخل في {formatDateTime(guest.checked_in_at)}
                </span>
                <Button size="sm" variant="secondary" onClick={reset} loading={pending}>
                  إعادة تعيين الحالة
                </Button>
              </>
            )}
          </div>
          <p className="mt-2 font-mono text-[10px] text-ink-faint" dir="ltr">
            {guest.code}
          </p>
        </div>
      </div>
    </Modal>
  );
}
