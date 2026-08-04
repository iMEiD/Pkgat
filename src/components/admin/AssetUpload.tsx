'use client';

import { useRef, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { createClient } from '@/lib/supabase/client';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

/** رفع صورة إلى مساحة تخزين الأدمن (القوالب / معرض الأعمال) */
export function AssetUpload({
  bucket,
  value,
  onUploaded,
  label,
  hint,
}: {
  bucket: 'templates' | 'gallery';
  value: string | null;
  onUploaded: (url: string, width: number, height: number) => void;
  label: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError('الصيغ المدعومة: PNG أو JPG أو WEBP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('حجم الملف يتجاوز ٨ ميجابايت.');
      return;
    }

    setUploading(true);
    try {
      const dims = await readDimensions(file);
      const supabase = createClient();
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, { cacheControl: '31536000', upsert: false });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(path);

      onUploaded(publicUrl, dims.width, dims.height);
    } catch {
      setError('تعذّر الرفع. تأكد أن حسابك أدمن وأن مساحة التخزين مهيّأة.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-semibold text-ink">{label}</span>

      <div className="flex items-start gap-3">
        <div className="grid h-24 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-sand-300 bg-sand-50">
          {value ? (
            // مصادر الصور متعددة النطاقات — img عادي أبسط من next/image هنا
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon name="upload" className="h-5 w-5 text-ink-faint" />
          )}
        </div>

        <div className="flex-1 space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(',')}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {value ? 'استبدال الصورة' : 'رفع صورة'}
          </Button>
          {hint && <p className="text-xs text-ink-faint">{hint}</p>}
        </div>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}

function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('تعذّرت قراءة الصورة'));
    };
    img.src = url;
  });
}
