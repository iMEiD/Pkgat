'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { whatsappHref } from '@/lib/site-settings';

/**
 * ما يحتاجه صاحب المناسبة بسرعة — خصوصاً وهو واقف على الباب.
 *
 * رابط لوحة المسح أهمها: يُرسل لمسؤول الاستقبال قبل المناسبة، وكان
 * مدفوناً داخل صفحة المسؤولين في كل مناسبة على حدة.
 */
export function QuickLinks({
  scanUrl,
  supportWhatsapp,
}: {
  scanUrl: string;
  supportWhatsapp: string | null;
}) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(scanUrl);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
    setTimeout(() => setCopied('idle'), 2500);
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-bold text-ink-faint">روابط سريعة</h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-sand-300 bg-sand-50 px-4 text-sm font-bold text-ink transition-colors hover:border-grape-300 hover:text-grape-600"
        >
          <Icon
            name={copied === 'done' ? 'check' : 'copy'}
            className={copied === 'done' ? 'h-4 w-4 text-mint-600' : 'h-4 w-4'}
          />
          {copied === 'done'
            ? 'نُسخ رابط لوحة المسح'
            : copied === 'failed'
              ? 'تعذّر النسخ — انسخه يدوياً'
              : 'انسخ رابط لوحة المسح'}
        </button>

        <Link
          href="/scan/login"
          target="_blank"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-sand-300 px-4 text-sm font-bold text-ink transition-colors hover:border-grape-300 hover:text-grape-600"
        >
          <Icon name="scan" className="h-4 w-4" />
          افتح لوحة المسح
        </Link>

        {supportWhatsapp && (
          <a
            href={whatsappHref(supportWhatsapp, 'السلام عليكم، عندي سؤال عن بكجات')}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-sand-300 px-4 text-sm font-bold text-ink transition-colors hover:border-grape-300 hover:text-grape-600"
          >
            <Icon name="whatsapp" className="h-4 w-4 text-grape-500" />
            تواصل معنا
          </a>
        )}
      </div>

      {/* الرابط ظاهراً أيضاً: النسخ قد يُمنع، ومن يقرأه من جواله يكتبه */}
      <p dir="ltr" className="mt-3 truncate text-left text-xs text-ink-faint">
        {scanUrl}
      </p>
    </Card>
  );
}
