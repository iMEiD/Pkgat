'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { arabicDigits } from '@/lib/utils/format';
import type { CheckState, MigrationStatus } from '@/lib/db-health';

export interface MigrationView extends MigrationStatus {
  /** نص الترحيل — يُرسل فقط لما ليس سليماً */
  sql: string | null;
}

const STATE_LABEL: Record<CheckState, string> = {
  ok: 'مكتمل',
  missing: 'ناقص',
  unknown: 'غير مؤكّد',
};

const STATE_TONE: Record<CheckState, string> = {
  ok: 'mint',
  missing: 'coral',
  unknown: 'sunny',
};

export function HealthReportView({
  migrations,
  allGood,
}: {
  migrations: MigrationView[];
  allGood: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const missing = migrations.filter((m) => m.state === 'missing');
  const unknown = migrations.filter((m) => m.state === 'unknown');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">فحص قاعدة البيانات</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-7 text-ink-soft">
            كل تحديث على قاعدة البيانات يُنفَّذ بلصق كوده في Supabase. هذه الصفحة تجرّب
            التحديثات فعلياً على قاعدتك — لا تفترض شيئاً — وتقول أيّها وصل وأيّها لم يصل.
          </p>
        </div>
        <Button
          variant="secondary"
          loading={pending}
          onClick={() => startTransition(() => router.refresh())}
        >
          <Icon name="refresh" className="h-4 w-4" />
          أعد الفحص
        </Button>
      </div>

      {allGood ? (
        <Alert tone="success" title="قاعدة البيانات مكتملة">
          كل التحديثات المطلوبة موجودة. لا يوجد ما تنفّذه.
        </Alert>
      ) : (
        <Alert
          tone={missing.length > 0 ? 'danger' : 'warning'}
          title={
            missing.length > 0
              ? `${arabicDigits(missing.length)} تحديث لم يصل لقاعدة البيانات`
              : 'تعذّر التأكد من بعض التحديثات'
          }
        >
          {missing.length > 0 ? (
            <>
              انزل للبطاقات المعلَّمة <span className="font-bold">«ناقص»</span> بالأسفل. كل واحدة
              فيها زر ينسخ الكود المطلوب، وخطوات لصقه في Supabase.
            </>
          ) : (
            <>
              الفحص لم يستطع الجزم بحالة {arabicDigits(unknown.length)} تحديث. راجع تفاصيلها
              بالأسفل.
            </>
          )}
        </Alert>
      )}

      <div className="space-y-4">
        {migrations.map((m) => (
          <MigrationCard key={m.file} migration={m} />
        ))}
      </div>
    </div>
  );
}

function MigrationCard({ migration }: { migration: MigrationView }) {
  const [open, setOpen] = useState(false);
  const isOk = migration.state === 'ok';

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-ink">{migration.title}</h2>
            <Badge tone={STATE_TONE[migration.state]} dot>
              {STATE_LABEL[migration.state]}
            </Badge>
          </div>
          <code dir="ltr" className="mt-1 block text-xs text-ink-faint">
            {migration.file}
          </code>
        </div>
      </div>

      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        <ul className="space-y-2">
          {migration.checks.map((check) => (
            <li key={check.label} className="flex items-start gap-2.5 text-sm">
              <StateDot state={check.state} />
              <div className="min-w-0">
                <span className="text-ink">{check.label}</span>
                {check.detail && check.state !== 'ok' && (
                  <span className="mt-0.5 block text-xs text-ink-soft">{check.detail}</span>
                )}
              </div>
            </li>
          ))}
        </ul>

        {!isOk && (
          <>
            {migration.state === 'missing' ? (
              <p className="mt-4 rounded-2xl bg-coral-50 px-4 py-3 text-sm leading-6 text-coral-600">
                <span className="font-bold">ما الذي يتعطّل: </span>
                {migration.breaks}
              </p>
            ) : (
              // «غير مؤكّد» ليس «ناقص»: لا ندّعي عطلاً لم نتحقق منه
              <Alert tone="warning" className="mt-4" title="تعذّر التأكد من هذا التحديث">
                الفحص لم يصل لجواب قاطع — غالباً لتعذّر الاتصال بقاعدة البيانات لحظة الفحص.
                اضغط «أعد الفحص» أولاً. إن بقيت الحالة كما هي، تنفيذ الكود بالأسفل آمن: كل
                التحديثات مكتوبة بحيث لا يضرّ تنفيذها مرتين.
              </Alert>
            )}

            {migration.sql ? (
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton sql={migration.sql} />
                  <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
                    {open ? 'إخفاء الكود' : 'اعرض الكود'}
                  </Button>
                </div>

                <ol className="mt-3 space-y-1.5 rounded-2xl bg-sand-50 p-4 text-xs leading-6 text-ink-soft">
                  <li>١. اضغط «انسخ الكود» بالأعلى.</li>
                  <li>
                    ٢. افتح Supabase ← مشروعك ← <span className="font-semibold text-ink">SQL Editor</span>{' '}
                    ← <span className="font-semibold text-ink">New query</span>.
                  </li>
                  <li>٣. الصق الكود كاملاً، ثم اضغط Run.</li>
                  <li>٤. ارجع هنا واضغط «أعد الفحص» — لا بد أن تتحوّل هذه البطاقة لـ«مكتمل».</li>
                </ol>

                {open && (
                  <pre
                    dir="ltr"
                    className="mt-3 max-h-96 overflow-auto rounded-2xl bg-ink p-4 text-left text-xs leading-5 text-sand-100"
                  >
                    <code>{migration.sql}</code>
                  </pre>
                )}
              </div>
            ) : (
              <Alert tone="warning" className="mt-4">
                نص هذا التحديث غير مضمّن في النسخة المنشورة. اطلبه من المطوّر.
              </Alert>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function CopyButton({ sql }: { sql: string }) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied('done');
    } catch {
      // المتصفح قد يمنع النسخ بلا تفاعل مباشر أو خارج HTTPS
      setCopied('failed');
    }
    setTimeout(() => setCopied('idle'), 2500);
  }

  return (
    <Button variant={copied === 'done' ? 'success' : 'primary'} size="sm" onClick={copy}>
      <Icon name={copied === 'done' ? 'check' : 'copy'} className="h-4 w-4" />
      {copied === 'done'
        ? 'تم النسخ'
        : copied === 'failed'
          ? 'تعذّر النسخ — اعرض الكود وانسخه يدوياً'
          : 'انسخ الكود'}
    </Button>
  );
}

function StateDot({ state }: { state: CheckState }) {
  const tone =
    state === 'ok' ? 'bg-mint-500' : state === 'missing' ? 'bg-coral-500' : 'bg-sunny-500';

  return (
    <span
      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone}`}
      aria-label={STATE_LABEL[state]}
    />
  );
}
