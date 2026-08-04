'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import {
  createContentKey,
  deleteContentKey,
  updateContent,
  updateSetting,
} from '@/lib/actions/admin';
import type { SiteContent, SiteSetting } from '@/lib/types/database';
import { cn } from '@/lib/utils/cn';

const PAGE_LABELS: Record<string, string> = {
  home: 'الصفحة الرئيسية',
  about: 'من نحن',
  pricing: 'الأسعار',
  gallery: 'معرض الأعمال',
  common: 'نصوص مشتركة',
};

const KIND_LABELS: Record<string, string> = {
  text: 'نص',
  richtext: 'نص طويل',
  image: 'صورة',
  list: 'قائمة',
};

export function ContentEditor({
  content,
  settings,
}: {
  content: SiteContent[];
  settings: SiteSetting[];
}) {
  const pages = [...new Set(content.map((c) => c.page))];
  const [activePage, setActivePage] = useState(pages[0] ?? 'home');
  const [addOpen, setAddOpen] = useState(false);

  const items = content.filter((c) => c.page === activePage);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-black text-ink">محتوى الموقع</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            كل نص في الموقع مخزّن هنا كبيانات — عدّله واحفظ، والتغيير يظهر مباشرة بدون كود.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} variant="secondary">
          <Icon name="plus" className="h-4 w-4" />
          مفتاح جديد
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => setActivePage(page)}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-bold transition-colors',
              activePage === page
                ? 'bg-grape-500 text-white shadow-pop'
                : 'bg-sand-100 text-ink-soft hover:bg-sand-200',
            )}
          >
            {PAGE_LABELS[page] ?? page}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {items.map((item) => (
          <ContentRow key={item.key} item={item} />
        ))}
        {items.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-soft">لا يوجد محتوى لهذه الصفحة.</p>
        )}
      </div>

      <Card>
        <CardHeader
          title="إعدادات المنصة"
          description="قيم تشغيلية تؤثر على سلوك المنصة."
        />
        <CardBody className="space-y-4">
          {settings.map((setting) => (
            <SettingRow key={setting.key} setting={setting} />
          ))}
        </CardBody>
      </Card>

      {addOpen && <AddKeyModal pages={pages} onClose={() => setAddOpen(false)} />}
    </div>
  );
}

function ContentRow({ item }: { item: SiteContent }) {
  const router = useRouter();
  const isList = item.kind === 'list' || Array.isArray(item.value);

  const [value, setValue] = useState(() =>
    isList ? JSON.stringify(item.value, null, 2) : String(item.value ?? ''),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);

    let parsed: unknown = value;
    if (isList) {
      try {
        parsed = JSON.parse(value);
      } catch {
        setError('صيغة JSON غير صحيحة — راجع الأقواس والفواصل.');
        return;
      }
    }

    startTransition(async () => {
      const res = await updateContent(item.key, parsed);
      if (!res.ok) {
        setError(res.error ?? 'تعذّر الحفظ.');
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    });
  }

  function remove() {
    if (!confirm(`حذف المفتاح «${item.key}»؟ سيختفي النص من الموقع.`)) return;
    startTransition(async () => {
      await deleteContentKey(item.key);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody className="pt-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink">{item.label ?? item.key}</p>
            <code dir="ltr" className="mt-0.5 block text-[11px] text-ink-faint">
              {item.key}
            </code>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="sand">{KIND_LABELS[item.kind] ?? item.kind}</Badge>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              aria-label="حذف"
              className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-coral-50 hover:text-coral-600"
            >
              <Icon name="trash" className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error && (
          <Alert tone="danger" className="mb-3">
            {error}
          </Alert>
        )}

        {isList ? (
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={Math.min(18, value.split('\n').length + 1)}
            dir="ltr"
            className="font-mono text-xs leading-6"
          />
        ) : item.kind === 'richtext' ? (
          <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={6} />
        ) : (
          <Input value={value} onChange={(e) => setValue(e.target.value)} />
        )}

        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" onClick={save} loading={pending}>
            حفظ
          </Button>
          {saved && <span className="text-xs font-bold text-mint-600">تم الحفظ ✓</span>}
          {isList && (
            <span className="text-xs text-ink-faint">
              القوائم تُحرَّر بصيغة JSON — حافظ على أسماء الحقول كما هي.
            </span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function SettingRow({ setting }: { setting: SiteSetting }) {
  const router = useRouter();
  const isNumber = typeof setting.value === 'number';
  const [value, setValue] = useState(() =>
    typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value),
  );
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    // نحافظ على نوع القيمة الأصلي: الأرقام تبقى أرقاماً والنصوص نصوصاً
    const parsed: unknown = isNumber ? Number(value) : value;

    startTransition(async () => {
      await updateSetting(setting.key, parsed);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 p-4">
      <Field label={setting.label ?? setting.key} className="min-w-[220px] flex-1">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type={isNumber ? 'number' : 'text'}
          dir={isNumber ? 'ltr' : undefined}
        />
      </Field>
      <Button size="sm" onClick={save} loading={pending}>
        حفظ
      </Button>
      {saved && <span className="pb-3 text-xs font-bold text-mint-600">✓</span>}
    </div>
  );
}

function AddKeyModal({ pages, onClose }: { pages: string[]; onClose: () => void }) {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [page, setPage] = useState(pages[0] ?? 'home');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState('text');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await createContentKey({
        key,
        page,
        label,
        kind,
        value: kind === 'list' ? [] : '',
      });
      if (!res.ok) {
        setError(res.error ?? 'تعذّر الإنشاء.');
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="مفتاح محتوى جديد"
      description="أنشئ نصاً جديداً قابلاً للتعديل. يحتاج ربطه في الكود عند أول إضافة."
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <Field label="المفتاح" hint="مثال: home.hero.badge" required>
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value.toLowerCase())}
            dir="ltr"
            required
            autoFocus
          />
        </Field>

        <Field label="الصفحة" required>
          <Select value={page} onChange={(e) => setPage(e.target.value)}>
            {pages.map((p) => (
              <option key={p} value={p}>
                {PAGE_LABELS[p] ?? p}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="الوصف" hint="يظهر لك في هذه اللوحة" required>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} required />
        </Field>

        <Field label="النوع" required>
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(KIND_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </Select>
        </Field>

        <Button type="submit" fullWidth loading={pending}>
          إنشاء
        </Button>
      </form>
    </Modal>
  );
}
