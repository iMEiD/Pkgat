'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

export function PrintButton() {
  // ننتظر تحميل الخطوط قبل فتح نافذة الطباعة حتى لا يُطبع التقرير بخط بديل
  useEffect(() => {
    void document.fonts?.ready;
  }, []);

  return (
    <div className="pk-no-print sticky top-4 z-10 mx-auto mb-6 flex max-w-[820px] flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-5 py-3 shadow-lift">
      <p className="text-sm text-ink-soft">
        من نافذة الطباعة اختر <span className="font-bold text-ink">«حفظ كملف PDF»</span> للحصول
        على نسخة إلكترونية.
      </p>
      <Button
        onClick={async () => {
          await document.fonts?.ready;
          window.print();
        }}
      >
        <Icon name="download" className="h-4 w-4" />
        طباعة / حفظ PDF
      </Button>
    </div>
  );
}
