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
    <div className="pk-no-print sticky top-4 z-10 mx-auto mb-6 max-w-[820px] rounded-2xl bg-white px-5 py-4 shadow-lift">
      <div className="flex flex-wrap items-center justify-between gap-3">
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

      {/*
        المتصفح يضيف ترويسة وتذييلاً خاصين به (رابط الصفحة والتاريخ ورقم
        الصفحة) ولا يمكن إخفاؤهما من CSS — فننبّه المستخدم لإطفائهما.
      */}
      <p className="mt-3 border-t border-sand-200 pt-3 text-xs leading-6 text-ink-faint">
        للحصول على ملف نظيف تماماً: افتح <span className="font-semibold text-ink-soft">«مزيد من
        الإعدادات»</span> في نافذة الطباعة وأطفئ خيار{' '}
        <span className="font-semibold text-ink-soft">«الرؤوس والتذييلات»</span> — وإلا سيضيف
        المتصفح رابط الصفحة والتاريخ أعلى كل ورقة.
      </p>
    </div>
  );
}
