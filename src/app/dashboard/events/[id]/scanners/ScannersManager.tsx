'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/Misc';
import {
  createScannerAccount,
  deleteScannerAccount,
  toggleScannerActive,
  updateScannerPassword,
} from '@/lib/actions/scanners';
import { formatDateTime } from '@/lib/utils/format';
import type { EventRow, ScannerAccount } from '@/lib/types/database';

export function ScannersManager({
  event,
  scanners,
}: {
  event: EventRow;
  scanners: ScannerAccount[];
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [passwordFor, setPasswordFor] = useState<ScannerAccount | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const scanUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/scan/login` : '/scan/login';

  function toggle(scanner: ScannerAccount) {
    startTransition(async () => {
      await toggleScannerActive(scanner.id, event.id, !scanner.is_active);
      router.refresh();
    });
  }

  function remove(scanner: ScannerAccount) {
    if (!confirm(`سيُحذف حساب «${scanner.display_name}» ولن يقدر يسجّل دخول. متأكد؟`)) return;
    startTransition(async () => {
      await deleteScannerAccount(scanner.id, event.id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Alert tone="info" title="كيف يعمل مسؤول الاستقبال؟">
        كل مسؤول له اسم مستخدم وكلمة مرور خاصة به، منفصلة تماماً عن حسابك. يفتح رابط لوحة
        المسح من متصفح جواله، يسجّل دخوله، ويبدأ المسح — بدون تحميل أي تطبيق. تقدر تنشئ حساباً
        لكل مدخل، وكل عملية مسح تُسجَّل باسم من نفّذها.
      </Alert>

      <Card>
        <CardHeader
          title="رابط لوحة المسح"
          description="أرسل هذا الرابط لمسؤولي الاستقبال مع بيانات دخول كل واحد."
        />
        <CardBody>
          <div className="flex flex-wrap items-center gap-2">
            <code
              dir="ltr"
              className="flex-1 overflow-x-auto rounded-2xl bg-sand-50 px-4 py-3 text-sm text-ink"
            >
              {scanUrl}
            </code>
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(scanUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? 'تم النسخ ✓' : 'نسخ الرابط'}
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">
          حسابات المسح ({scanners.length})
        </h2>
        <Button onClick={() => setAddOpen(true)}>
          <Icon name="plus" className="h-4 w-4" />
          حساب جديد
        </Button>
      </div>

      {scanners.length === 0 ? (
        <EmptyState
          icon="📱"
          title="ما أنشأت حسابات مسح بعد"
          description="أنشئ حساباً واحداً على الأقل قبل موعد المناسبة — بدونه ما فيه أحد يقدر يمسح الباركودات."
          action={<Button onClick={() => setAddOpen(true)}>إنشاء أول حساب</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {scanners.map((scanner) => (
            <Card key={scanner.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-ink">{scanner.display_name}</h3>
                  <p className="mt-0.5 font-mono text-xs text-ink-soft" dir="ltr">
                    {scanner.username}
                  </p>
                </div>
                <Badge tone={scanner.is_active ? 'mint' : 'sand'} dot>
                  {scanner.is_active ? 'مفعّل' : 'موقوف'}
                </Badge>
              </div>

              <p className="mt-3 text-xs text-ink-faint">
                آخر دخول: {scanner.last_login_at ? formatDateTime(scanner.last_login_at) : 'لم يدخل بعد'}
              </p>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-sand-200 pt-4">
                <Button size="sm" variant="secondary" onClick={() => setPasswordFor(scanner)}>
                  تغيير كلمة المرور
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(scanner)} disabled={pending}>
                  {scanner.is_active ? 'إيقاف' : 'تفعيل'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-coral-600"
                  onClick={() => remove(scanner)}
                  disabled={pending}
                >
                  حذف
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {addOpen && (
        <AddScannerModal
          eventId={event.id}
          eventTitle={event.title}
          onClose={() => setAddOpen(false)}
        />
      )}

      {passwordFor && (
        <ChangePasswordModal
          scanner={passwordFor}
          eventId={event.id}
          onClose={() => setPasswordFor(null)}
        />
      )}
    </div>
  );
}

function AddScannerModal({
  eventId,
  eventTitle,
  onClose,
}: {
  eventId: string;
  eventTitle: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createScannerAccount(eventId, displayName, username, password);
      if (!res.ok) {
        setError(res.error ?? 'تعذّر الإنشاء.');
        return;
      }
      setCreated({ username: res.username!, password });
      router.refresh();
    });
  }

  if (created) {
    return (
      <Modal
        open
        onClose={onClose}
        title="تم إنشاء الحساب"
        footer={<Button onClick={onClose}>تمام</Button>}
      >
        <Alert tone="warning" title="احفظ كلمة المرور الآن">
          ما نقدر نعرضها لك مرة ثانية — كلمة المرور مخزّنة مشفّرة. انسخها وأرسلها لمسؤول الاستقبال.
        </Alert>

        <div className="mt-4 space-y-3 rounded-2xl bg-sand-50 p-4">
          <CredentialRow label="اسم المستخدم" value={created.username} />
          <CredentialRow label="كلمة المرور" value={created.password} />
          <CredentialRow
            label="رابط الدخول"
            value={typeof window !== 'undefined' ? `${window.location.origin}/scan/login` : '/scan/login'}
          />
        </div>

        <Button
          variant="secondary"
          fullWidth
          className="mt-4"
          onClick={() =>
            navigator.clipboard.writeText(
              `لوحة مسح دعوات: ${eventTitle}\n` +
                `الرابط: ${window.location.origin}/scan/login\n` +
                `اسم المستخدم: ${created.username}\n` +
                `كلمة المرور: ${created.password}`,
            )
          }
        >
          نسخ البيانات كاملة للإرسال
        </Button>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="حساب مسؤول استقبال"
      description="حساب مستقل مرتبط بهذه المناسبة فقط."
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <Field label="اسم المسؤول" hint="يظهر في سجل عمليات المسح" required>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="مثال: سعد — المدخل الرئيسي"
            required
            autoFocus
          />
        </Field>

        <Field
          label="اسم المستخدم"
          hint="حروف إنجليزية صغيرة وأرقام و . _ - فقط"
          required
        >
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            dir="ltr"
            placeholder="saad.gate1"
            required
          />
        </Field>

        <Field label="كلمة المرور" hint="٦ أحرف على الأقل" required>
          <div className="flex gap-2">
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              required
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPassword(generatePassword())}
            >
              توليد
            </Button>
          </div>
        </Field>

        <Button type="submit" fullWidth loading={pending}>
          إنشاء الحساب
        </Button>
      </form>
    </Modal>
  );
}

function ChangePasswordModal({
  scanner,
  eventId,
  onClose,
}: {
  scanner: ScannerAccount;
  eventId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [password, setPassword] = useState(() => generatePassword());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updateScannerPassword(scanner.id, eventId, password);
      if (!res.ok) {
        setError(res.error ?? 'تعذّر التغيير.');
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  return (
    <Modal open onClose={onClose} title={`كلمة مرور: ${scanner.display_name}`}>
      {done ? (
        <>
          <Alert tone="success" title="تم التغيير">
            أرسل كلمة المرور الجديدة لمسؤول الاستقبال.
          </Alert>
          <div className="mt-4 space-y-3 rounded-2xl bg-sand-50 p-4">
            <CredentialRow label="اسم المستخدم" value={scanner.username} />
            <CredentialRow label="كلمة المرور الجديدة" value={password} />
          </div>
          <Button fullWidth className="mt-4" onClick={onClose}>
            تمام
          </Button>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="كلمة المرور الجديدة" required>
            <div className="flex gap-2">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" required />
              <Button type="button" variant="secondary" onClick={() => setPassword(generatePassword())}>
                توليد
              </Button>
            </div>
          </Field>
          <Button type="submit" fullWidth loading={pending}>
            حفظ
          </Button>
        </form>
      )}
    </Modal>
  );
}

function CredentialRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold text-ink-faint">{label}</span>
      <code dir="ltr" className="max-w-[60%] truncate text-sm font-bold text-ink">
        {value}
      </code>
    </div>
  );
}

/** كلمة مرور عشوائية سهلة النطق عبر الهاتف (بدون محارف متشابهة) */
function generatePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}
