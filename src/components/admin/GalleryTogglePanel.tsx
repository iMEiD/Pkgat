'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { saveGalleryEnabled } from '@/lib/actions/admin';
import { arabicDigits } from '@/lib/utils/format';

/**
 * مفتاح صفحة «أعمالنا».
 *
 * الإطفاء يخفي روابطها من الترويسة والذيل، ويردّ ٤٠٤ لمن وصلها بعنوانها
 * — فلا تبقى صفحةٌ قرّر صاحب الموقع ألّا تُرى مفتوحةً لمن حفظ رابطها.
 */
export function GalleryTogglePanel({
  enabled: initial,
  published,
}: {
  enabled: boolean;
  /** عدد الأعمال المنشورة فعلاً — لتحذير من يشغّل صفحة فارغة */
  published: number;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setError(null);
    setEnabled(next);
    setSaved(false);
    startTransition(async () => {
      const res = await saveGalleryEnabled(next);
      if (!res.ok) {
        setError(res.error ?? 'تعذّر الحفظ.');
        setEnabled(!next);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title="صفحة «أعمالنا»"
        description="تعرض دعوات عملائك الحقيقية — لا القوالب الجاهزة."
      />
      <CardBody className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {saved && (
          <Alert tone="success">
            {enabled ? 'الصفحة ظاهرة الآن للزوار.' : 'الصفحة مطفأة — واختفت روابطها.'}
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => toggle(!enabled)}
            loading={pending}
            variant={enabled ? 'secondary' : 'primary'}
          >
            {enabled ? 'أطفئ الصفحة' : 'شغّل الصفحة'}
          </Button>
          <span className="text-sm text-ink-soft">
            الحالة:{' '}
            <span className="font-bold text-ink">{enabled ? 'ظاهرة للزوار' : 'مطفأة'}</span>
            {' · '}
            <span>{arabicDigits(published)} عمل منشور</span>
          </span>
        </div>

        {enabled && published === 0 && (
          <Alert tone="warning">
            الصفحة مشغّلة وما فيها ولا عمل منشور — الزائر بيشوف صفحة فارغة. أضف أعمالاً
            من <span className="font-bold">معرض الأعمال</span> في القائمة، أو أطفئ الصفحة
            لين تجمع أعمالاً.
          </Alert>
        )}

        <p className="text-xs leading-6 text-ink-faint">
          القوالب الجاهزة انسحبت من هذه الصفحة: القالب ليس عملاً أُنجز، والزائر يقرأ
          الصفحة على أنها سجلّ إنجاز. وهي باقية في المحرّر يختار منها عملاؤك كالمعتاد.
        </p>
      </CardBody>
    </Card>
  );
}
