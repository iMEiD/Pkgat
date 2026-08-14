'use client';

import { useRef, useState, useTransition } from 'react';
import Papa from 'papaparse';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { addGuests, type AddGuestsResult, type GuestInput } from '@/lib/actions/guests';
import type { EventTag } from '@/lib/types/database';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

/*
 * طريقتان لا ثلاث.
 *
 * «يدوي» كان يضيف اسماً واحداً في كل مرة بحقول جوال ومقاعد — و«لصق
 * قائمة» يفعل الشيء نفسه وأكثر: اسم في كل سطر، واحداً كان أو ثلاثمئة.
 * وجودهما معاً يجعل المستخدم يختار بين طريقين إلى مكان واحد، وهو
 * تفريعٌ بلا مقابل.
 *
 * والجوال رُفع: المنصة لا ترسل الدعوات — صاحب المناسبة يوزّعها بنفسه —
 * فالرقم حقلٌ يُطلب ولا يُستعمل.
 */
type Method = 'paste' | 'file';

export function AddGuestsPanel({
  eventId,
  tags,
  onDone,
  onPaymentRequired,
}: {
  eventId: string;
  tags: EventTag[];
  onDone: (added: number) => void;
  onPaymentRequired: (message: string) => void;
}) {
  const [method, setMethod] = useState<Method>('paste');
  const [tagId, setTagId] = useState<string>('');
  const [result, setResult] = useState<AddGuestsResult | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(guests: GuestInput[]) {
    setResult(null);
    startTransition(async () => {
      const res = await addGuests(
        eventId,
        guests.map((g) => ({ ...g, tagId: g.tagId ?? (tagId || null) })),
      );
      setResult(res);
      if (res.ok) onDone(res.added ?? 0);
      else if (res.paymentRequired) onPaymentRequired(res.error ?? '');
    });
  }

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-sand-100 p-1.5">
        {(
          [
            { key: 'paste', label: 'اكتب أو الصق', icon: 'edit' },
            { key: 'file', label: 'استيراد ملف', icon: 'upload' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setMethod(tab.key);
              setResult(null);
            }}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition-all duration-200',
              method === tab.key ? 'bg-surface text-grape-600 shadow-soft' : 'text-ink-soft hover:text-ink',
            )}
          >
            <Icon name={tab.icon} className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {tags.length > 0 && (
        <Field
          label="الفئة الافتراضية"
          hint="تُطبَّق على كل المدعوين المُضافين في هذه العملية"
          className="mb-5"
        >
          <Select value={tagId} onChange={(e) => setTagId(e.target.value)}>
            <option value="">بدون فئة</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {result && !result.ok && (
        <Alert tone={result.paymentRequired ? 'warning' : 'danger'} className="mb-4">
          {result.error}
        </Alert>
      )}
      {result?.ok && (
        <Alert tone="success" className="mb-4">
          تمت إضافة {formatNumber(result.added ?? 0)} مدعو
          {result.skipped ? ` (تجاهلنا ${formatNumber(result.skipped)} سطراً فارغاً)` : ''}.
        </Alert>
      )}

      {method === 'paste' && <PasteForm pending={pending} onSubmit={submit} />}
      {method === 'file' && <FileForm pending={pending} onSubmit={submit} />}
    </div>
  );
}

function PasteForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (guests: GuestInput[]) => void;
}) {
  const [value, setValue] = useState('');
  const names = value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (names.length === 0) return;
        onSubmit(names.map((name) => ({ name })));
        setValue('');
      }}
      className="space-y-4"
    >
      <Field label="أسماء المدعوين" hint="اسم واحد في كل سطر — اكتبهم أو الصق قائمة جاهزة">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={10}
          placeholder={'عبدالله الشمري\nنورة العتيبي\nمحمد القحطاني'}
        />
      </Field>

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-soft">
          {names.length > 0 ? `سيُضاف ${formatNumber(names.length)} مدعو` : 'اكتب الأسماء أو الصقها'}
        </span>
        <Button type="submit" loading={pending} disabled={names.length === 0}>
          إضافة الكل
        </Button>
      </div>
    </form>
  );
}

interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

function FileForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (guests: GuestInput[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [nameCol, setNameCol] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setParsed(null);
    setLoading(true);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let data: ParsedFile;

      if (ext === 'csv' || ext === 'txt' || file.type === 'text/csv') {
        data = await parseCsv(file);
      } else if (ext === 'xlsx' || ext === 'xls') {
        data = await parseExcel(file);
      } else if (ext === 'vcf') {
        data = parseVcards(await file.text());
      } else {
        throw new Error('unsupported');
      }

      if (data.rows.length === 0) throw new Error('empty');

      setParsed(data);
      // نخمّن عمود الاسم تلقائياً
      const guessName =
        data.headers.find((h) => /اسم|name|full.?name|الاسم/i.test(h)) ?? data.headers[0];
      setNameCol(guessName);
    } catch (e) {
      setError(
        (e as Error).message === 'unsupported'
          ? 'الصيغ المدعومة: CSV و Excel (xlsx/xls) وملف جهات الاتصال (vcf).'
          : 'تعذّرت قراءة الملف أو أنه فارغ.',
      );
    } finally {
      setLoading(false);
    }
  }

  const preview = parsed && nameCol ? parsed.rows.slice(0, 5).map((r) => r[nameCol]) : [];
  const validCount = parsed && nameCol ? parsed.rows.filter((r) => r[nameCol]?.trim()).length : 0;

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt,.xlsx,.xls,.vcf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />

      <div className="rounded-3xl border-2 border-dashed border-sand-300 bg-sand-50/60 p-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-surface text-grape-500 shadow-soft">
          <Icon name="upload" className="h-6 w-6" />
        </div>
        <p className="mt-3 text-sm font-bold text-ink">استورد قائمة المدعوين</p>
        <p className="mt-1 text-xs text-ink-soft">CSV · Excel · جهات اتصال (vcf)</p>
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          loading={loading}
          onClick={() => inputRef.current?.click()}
        >
          اختر الملف
        </Button>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {parsed && (
        <div className="space-y-4 rounded-2xl border border-sand-200 bg-surface p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="عمود الاسم" required>
              <Select value={nameCol} onChange={(e) => setNameCol(e.target.value)}>
                {parsed.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {preview.length > 0 && (
            <div className="rounded-xl bg-sand-50 p-3">
              <p className="text-xs font-bold text-ink-faint">معاينة أول ٥ أسماء:</p>
              <ul className="mt-1.5 space-y-0.5 text-sm text-ink-soft">
                {preview.map((n, i) => (
                  <li key={i} className="truncate">
                    {n || <span className="text-coral-500">(فارغ — سيُتجاهل)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink-soft">
              {formatNumber(validCount)} اسم صالح من {formatNumber(parsed.rows.length)} صف
            </span>
            <Button
              loading={pending}
              disabled={validCount === 0}
              onClick={() =>
                onSubmit(
                  parsed.rows
                    .filter((r) => r[nameCol]?.trim())
                    .map((r) => ({
                      name: r[nameCol],
                    })),
                )
              }
            >
              استيراد {formatNumber(validCount)} مدعو
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function parseCsv(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const headers = (res.meta.fields ?? []).filter(Boolean);
        if (headers.length === 0) reject(new Error('empty'));
        else resolve({ headers, rows: res.data });
      },
      error: () => reject(new Error('parse')),
    });
  });
}

async function parseExcel(file: File): Promise<ParsedFile> {
  // نحمّل مكتبة Excel عند الحاجة فقط لتخفيف حزمة الصفحة
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '', raw: false });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

/** استخراج الأسماء والأرقام من ملف جهات اتصال vCard */
function parseVcards(content: string): ParsedFile {
  const rows: Record<string, string>[] = [];

  for (const card of content.split(/BEGIN:VCARD/i).slice(1)) {
    const fn = card.match(/^FN[^:]*:(.+)$/im)?.[1]?.trim();
    const tel = card.match(/^TEL[^:]*:(.+)$/im)?.[1]?.trim();
    if (fn) rows.push({ الاسم: fn, الجوال: tel ?? '' });
  }

  return { headers: ['الاسم', 'الجوال'], rows };
}
