'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Misc';
import { deleteCustomFont, saveCustomFont } from '@/lib/actions/admin';
import { createClient } from '@/lib/supabase/client';
import type { CustomFontRow } from '@/lib/types/database';

const MAX_BYTES = 3 * 1024 * 1024;

/** امتداد الملف ← تلميح الصيغة الذي يفهمه FontFace */
const FORMATS: Record<string, string> = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
  otf: 'opentype',
};

export function FontsManager({ fonts }: { fonts: CustomFontRow[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [family, setFamily] = useState('');
  const [label, setLabel] = useState('');
  const [weight, setWeight] = useState(400);
  const [fileUrl, setFileUrl] = useState('');
  const [format, setFormat] = useState('woff2');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // نسجّل الخطوط المحفوظة لتظهر معاينتها بخطها الحقيقي في هذه الصفحة
  useEffect(() => {
    for (const f of fonts) {
      try {
        const face = new FontFace(f.family, `url("${f.file_url}") format("${f.format}")`, {
          weight: String(f.weight),
        });
        face.load().then((loaded) => document.fonts.add(loaded)).catch(() => {});
      } catch {
        /* خط تالف — تظهر معاينته بخط بديل ولا شيء ينكسر */
      }
    }
  }, [fonts]);

  async function upload(file: File) {
    setError(null);

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!FORMATS[ext]) {
      setError('الصيغ المدعومة: woff2 و woff و ttf و otf.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('حجم الملف يتجاوز ٣ ميجابايت. استخدم صيغة woff2 فهي الأصغر.');
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('fonts')
        .upload(path, file, { cacheControl: '31536000', upsert: false });

      if (upErr) throw upErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from('fonts').getPublicUrl(path);

      setFileUrl(publicUrl);
      setFormat(FORMATS[ext]);
      if (!label) setLabel(file.name.replace(/\.[^.]+$/, ''));
    } catch {
      setError('تعذّر رفع الملف. تأكد أن مخزن fonts موجود وأنك أدمن.');
    } finally {
      setUploading(false);
    }
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveCustomFont({
        family,
        label,
        fileUrl,
        format,
        weight,
        isActive: true,
        sortOrder: fonts.length * 10,
      });

      if (!res.ok) return setError(res.error ?? 'تعذّر الحفظ.');

      setFamily('');
      setLabel('');
      setFileUrl('');
      setWeight(400);
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    });
  }

  function toggleActive(font: CustomFontRow) {
    startTransition(async () => {
      const res = await saveCustomFont({
        id: font.id,
        family: font.family,
        label: font.label,
        fileUrl: font.file_url,
        format: font.format,
        weight: font.weight,
        isActive: !font.is_active,
        sortOrder: font.sort_order,
      });
      if (!res.ok) setError(res.error ?? 'تعذّر التحديث.');
      else router.refresh();
    });
  }

  function remove(font: CustomFontRow) {
    if (!confirm(`حذف خط «${font.label}»؟ التصاميم التي تستخدمه ستُرسم بخط بديل.`)) return;
    startTransition(async () => {
      const res = await deleteCustomFont(font.id);
      if (!res.ok) setError(res.error ?? 'تعذّر الحذف.');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">الخطوط</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          ارفع خطوطك الخاصة لتظهر لكل المستخدمين في محرّر التصميم مع الخطوط الجاهزة.
        </p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader title="رفع خط جديد" description="woff2 هي الأفضل — أصغر حجماً وأسرع تحميلاً." />
        <CardBody className="space-y-4">
          <Field label="ملف الخط" htmlFor="font-file" required>
            <input
              ref={fileRef}
              id="font-file"
              type="file"
              accept=".woff2,.woff,.ttf,.otf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
              className="w-full rounded-2xl border border-sand-300 bg-surface p-3 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-grape-500 file:px-4 file:py-2 file:text-xs file:font-bold file:text-white"
            />
          </Field>

          {uploading && <Alert tone="info">جاري الرفع…</Alert>}
          {fileUrl && !uploading && <Alert tone="success">تم رفع الملف. أكمل البيانات واحفظ.</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="اسم الخط (بالإنجليزية)"
              htmlFor="family"
              hint="يُستخدم داخلياً — بلا مسافات غريبة"
              required
            >
              <Input
                id="family"
                dir="ltr"
                value={family}
                onChange={(e) => setFamily(e.target.value)}
                placeholder="MyArabicFont"
              />
            </Field>

            <Field label="الاسم المعروض" htmlFor="label" hint="يراه المستخدم في القائمة" required>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="خطي الخاص"
              />
            </Field>
          </div>

          <Field label="وزن الخط" htmlFor="weight" hint="وزن الملف المرفوع نفسه">
            <Select
              id="weight"
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
            >
              {[300, 400, 500, 600, 700, 800, 900].map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </Select>
          </Field>

          <div className="rounded-2xl bg-sand-50 p-4 text-xs leading-6 text-ink-soft">
            كل ملف خط وجه واحد بوزن واحد. لو تبي الخط بوزنين، ارفع ملفين باسمين مختلفين.
            ⚠️ تأكد أن لديك حق استخدام الخط — بعض الخطوط التجارية تمنع الاستخدام على الويب.
          </div>

          <Button onClick={save} loading={pending} disabled={!fileUrl || !family || !label}>
            حفظ الخط
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`الخطوط المرفوعة (${fonts.length})`} />
        <CardBody>
          {fonts.length === 0 ? (
            <EmptyState
              icon="🔤"
              title="ما رفعت خطوطاً بعد"
              description="الخطوط الجاهزة الاثنا عشر متاحة للمستخدمين على أي حال."
            />
          ) : (
            <ul className="space-y-3">
              {fonts.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sand-200 p-4"
                >
                  <div className="min-w-0">
                    <p
                      className="truncate text-lg text-ink"
                      style={{ fontFamily: `"${f.family}", sans-serif`, fontWeight: f.weight }}
                    >
                      بكجات — دعوة زفاف ١٢٣
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {f.label} · <span dir="ltr">{f.family}</span> · {f.weight} · {f.format}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge tone={f.is_active ? 'mint' : 'sand'} dot>
                      {f.is_active ? 'مفعّل' : 'موقوف'}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => toggleActive(f)}
                    >
                      {f.is_active ? 'إيقاف' : 'تفعيل'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-coral-600"
                      disabled={pending}
                      onClick={() => remove(f)}
                    >
                      حذف
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
