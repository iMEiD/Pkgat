'use client';

import { useRef, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

export function UploadDesign({
  userId,
  currentUrl,
  onUploaded,
}: {
  userId: string;
  currentUrl: string | null;
  onUploaded: (url: string, width: number, height: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError('الصيغ المدعومة: PNG أو JPG أو WEBP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('حجم الملف يتجاوز ٨ ميجابايت. صغّر الصورة وحاول مرة أخرى.');
      return;
    }

    setUploading(true);
    try {
      const dims = await readDimensions(file);
      const supabase = createClient();
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      // المسار يبدأ بمعرّف المستخدم لأن سياسة التخزين تسمح له بمجلده فقط
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('designs')
        .upload(path, file, { cacheControl: '31536000', upsert: false });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('designs').getPublicUrl(path);

      onUploaded(publicUrl, dims.width, dims.height);
    } catch {
      setError('تعذّر رفع التصميم. تأكد من اتصالك وحاول مرة أخرى.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={cn(
          'rounded-3xl border-2 border-dashed p-6 text-center transition-colors',
          dragOver ? 'border-grape-400 bg-grape-50' : 'border-sand-300 bg-sand-50/60',
        )}
      >
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-grape-500 shadow-soft">
          <Icon name="upload" className="h-6 w-6" />
        </div>
        <p className="mt-3 text-sm font-bold text-ink">اسحب تصميمك هنا أو اختر ملفاً</p>
        <p className="mt-1 text-xs text-ink-soft">
          PNG أو JPG أو WEBP — حتى ٨ ميجابايت. يُفضّل مقاس عمودي (مثلاً ١٠٨٠×١٩٢٠).
        </p>

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
          className="mt-4"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          اختر ملف التصميم
        </Button>
      </div>

      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}

      {currentUrl && !uploading && (
        <p className="mt-3 flex items-center gap-2 text-xs text-mint-600">
          <Icon name="check" className="h-4 w-4" strokeWidth={2.5} />
          تصميمك مرفوع وجاهز — حدّد موضع الاسم والباركود من المعاينة.
        </p>
      )}
    </div>
  );
}

/** يقرأ أبعاد الصورة لضبط مقاس الكانفس على مقاس التصميم الأصلي */
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
