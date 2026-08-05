'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { formatDateTime } from '@/lib/utils/format';
import { isLateArrival } from '@/lib/utils/event-phase';
import type { EventRow, EventTag, GuestState } from '@/lib/types/database';

const STATE_LABELS: Record<string, string> = {
  used: 'حضر',
  active: 'لم يحضر',
  inactive: 'باركود غير مفعّل',
  expired: 'باركود منتهي',
};

/**
 * تصدير قائمة الحضور كملف Excel.
 *
 * التقرير المطبوع للعرض، وهذا للتسويات: صاحب المناسبة يحتاج الأسماء في
 * جدول يفرزه ويصفّيه — لا صورة PDF. الملف يُبنى في المتصفح فلا يمر على
 * الخادم ولا نحتاج مسار تنزيل.
 */
export function ExportAttendance({
  event,
  guests,
  tags,
}: {
  event: EventRow;
  guests: GuestState[];
  tags: EventTag[];
}) {
  const [busy, setBusy] = useState(false);

  async function exportFile() {
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const tagMap = new Map(tags.map((t) => [t.id, t.name]));

      const rows = guests.map((g) => ({
        'الاسم': g.name,
        'الجوال': g.phone ?? '',
        'الفئة': g.tag_id ? (tagMap.get(g.tag_id) ?? '') : 'بدون فئة',
        'عدد المقاعد': g.seats,
        'الحالة': STATE_LABELS[g.code_state] ?? g.code_state,
        'وقت الدخول': g.checked_in_at ? formatDateTime(g.checked_in_at) : '',
        'متأخر': isLateArrival(event, g.checked_in_at) ? 'نعم' : '',
        'مرات الدخول': g.entries_count,
      }));

      const sheet = XLSX.utils.json_to_sheet(rows);
      // عرض ثابت للأعمدة، وإلا ظهرت الأسماء مقصوصة عند الفتح
      sheet['!cols'] = [
        { wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
        { wch: 18 }, { wch: 22 }, { wch: 8 }, { wch: 12 },
      ];
      // Excel يقرأ من اليمين لليسار لملف عربي
      sheet['!views'] = [{ RTL: true }];

      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'الحضور');

      const safeTitle = event.title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
      XLSX.writeFile(book, `${safeTitle} — الحضور.xlsx`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" onClick={exportFile} loading={busy} disabled={guests.length === 0}>
      <Icon name="download" className="h-4 w-4" />
      تصدير Excel
    </Button>
  );
}
