import { createClient } from '@/lib/supabase/server';
import { computeEventPhase, type EventPhase } from '@/lib/utils/event-phase';
import { getEventQuota } from '@/lib/data/quota';
import type { EventRow } from '@/lib/types/database';

/**
 * جاهزية المناسبة — ما أُنجز منها وما ينقصها.
 *
 * اللوحة كانت تعرض المناسبات ولا تقول ما ينقص كل واحدة إلا بشارات
 * صغيرة داخل بطاقتها، فلا يرى صاحبها الصورة كاملة ولا يعرف من أين
 * يبدأ. هذا الملف يجمع النواقص مرة واحدة لكل المناسبات.
 */
export interface EventReadiness {
  event: EventRow;
  guestCount: number;
  attendedCount: number;
  scannerCount: number;
  hasDesign: boolean;
  phase: EventPhase;
  /** عدد المدعوين تجاوز ما تسمح به الحصة — باركوداتهم لن تعمل */
  overQuota: boolean;
  /** الحد الفعّال لهذه المناسبة، null يعني بلا حد */
  limit: number | null;
}

export type IssueKind = 'design' | 'guests' | 'scanner' | 'quota';

export interface Issue {
  eventId: string;
  eventTitle: string;
  kind: IssueKind;
  /** ما ينقص، بلغة صاحب المناسبة */
  label: string;
  /** ما يترتب عليه لو بقي */
  consequence: string;
  href: string;
  /** يمنع الدخول على الباب فعلاً */
  blocking: boolean;
}

/** ترتيب الخطورة: ما يمنع الدخول أولاً */
const KIND_ORDER: Record<IssueKind, number> = { quota: 0, guests: 1, design: 2, scanner: 3 };

export async function loadReadiness(
  events: EventRow[],
  userId: string,
): Promise<EventReadiness[]> {
  const supabase = await createClient();
  const ids = events.map((e) => e.id);

  if (ids.length === 0) return [];

  const [{ data: guests }, { data: scanners }] = await Promise.all([
    supabase.from('guests').select('event_id, checked_in_at').in('event_id', ids),
    supabase.from('scanner_accounts').select('event_id').in('event_id', ids).eq('is_active', true),
  ]);

  const counts = new Map<string, { total: number; attended: number }>();
  for (const g of guests ?? []) {
    const entry = counts.get(g.event_id) ?? { total: 0, attended: 0 };
    entry.total += 1;
    if (g.checked_in_at) entry.attended += 1;
    counts.set(g.event_id, entry);
  }

  const scannerCounts = new Map<string, number>();
  for (const s of scanners ?? []) {
    scannerCounts.set(s.event_id, (scannerCounts.get(s.event_id) ?? 0) + 1);
  }

  // الحصة تُقرأ من المصدر الموحّد نفسه الذي تفرضه قاعدة البيانات
  const quotas = await Promise.all(events.map((e) => getEventQuota(e, userId)));

  return events.map((event, i) => {
    const c = counts.get(event.id) ?? { total: 0, attended: 0 };
    const limit = quotas[i].limit;

    return {
      event,
      guestCount: c.total,
      attendedCount: c.attended,
      scannerCount: scannerCounts.get(event.id) ?? 0,
      hasDesign: Boolean(event.design?.backgroundUrl),
      phase: computeEventPhase(event),
      limit,
      overQuota: limit !== null && c.total > limit,
    };
  });
}

/** أقرب مناسبة حقيقية لم تنتهِ — التجريبية ليست موعداً حقيقياً */
export function pickNextEvent(items: EventReadiness[]): EventReadiness | null {
  const candidates = items
    .filter((r) => !r.event.is_demo && r.phase !== 'ended')
    .sort((a, b) => +new Date(a.event.starts_at) - +new Date(b.event.starts_at));

  return candidates[0] ?? null;
}

/** النواقص عبر المناسبات، مرتّبة بما يمنع الدخول أولاً */
export function collectIssues(items: EventReadiness[], skipEventId?: string): Issue[] {
  const issues: Issue[] = [];

  for (const r of items) {
    if (r.event.is_demo || r.phase === 'ended' || r.event.id === skipEventId) continue;

    const base = { eventId: r.event.id, eventTitle: r.event.title };

    if (r.overQuota) {
      issues.push({
        ...base,
        kind: 'quota',
        label: `${r.guestCount - (r.limit ?? 0)} مدعو خارج الحصة`,
        consequence: 'باركوداتهم لن تعمل على الباب',
        href: `/dashboard/events/${r.event.id}/guests`,
        blocking: true,
      });
    }

    if (r.guestCount === 0) {
      issues.push({
        ...base,
        kind: 'guests',
        label: 'لا يوجد مدعوون',
        consequence: 'لا دعوات تُولَّد بلا مدعوين',
        href: `/dashboard/events/${r.event.id}/guests`,
        blocking: true,
      });
    }

    if (!r.hasDesign) {
      issues.push({
        ...base,
        kind: 'design',
        label: 'التصميم ناقص',
        consequence: 'الدعوة تُولَّد بخلفية فارغة',
        href: `/dashboard/events/${r.event.id}/design`,
        blocking: false,
      });
    }

    if (r.scannerCount === 0) {
      issues.push({
        ...base,
        kind: 'scanner',
        label: 'لا يوجد مسؤول مسح',
        consequence: 'ما من أحد يقدر يمسح الباركودات وقت المناسبة',
        href: `/dashboard/events/${r.event.id}/scanners`,
        blocking: true,
      });
    }
  }

  return issues.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}
