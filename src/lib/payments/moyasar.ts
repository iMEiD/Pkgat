/**
 * تكامل بوابة الدفع السعودية Moyasar.
 *
 * نستخدم واجهة الفواتير (Invoices) المستضافة: المستخدم يُحوَّل لصفحة دفع
 * تابعة لمُيسّر تدعم مدى وApple Pay والبطاقات الائتمانية — فلا تمر بيانات
 * البطاقة على خوادمنا إطلاقاً.
 */

const API_BASE = 'https://api.moyasar.com/v1';

export interface MoyasarInvoice {
  id: string;
  status: 'initiated' | 'paid' | 'failed' | 'canceled' | 'expired' | 'refunded';
  amount: number;
  currency: string;
  description: string;
  url: string;
  metadata?: Record<string, string>;
  created_at?: string;
}

export function isMoyasarConfigured(): boolean {
  return Boolean(process.env.MOYASAR_SECRET_KEY);
}

function authHeader(): string {
  const key = process.env.MOYASAR_SECRET_KEY;
  if (!key) throw new Error('MOYASAR_SECRET_KEY غير مضبوط');
  // مُيسّر يستخدم Basic auth بالمفتاح السري كاسم مستخدم وكلمة مرور فارغة
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

export async function createInvoice(input: {
  amountHalalas: number;
  description: string;
  callbackUrl: string;
  metadata: Record<string, string>;
  currency?: string;
  expireAfterMinutes?: number;
}): Promise<MoyasarInvoice> {
  const body = new URLSearchParams({
    amount: String(input.amountHalalas),
    currency: input.currency ?? 'SAR',
    description: input.description,
    callback_url: input.callbackUrl,
    expired_at: new Date(
      Date.now() + (input.expireAfterMinutes ?? 60) * 60_000,
    ).toISOString(),
  });

  for (const [key, value] of Object.entries(input.metadata)) {
    body.append(`metadata[${key}]`, value);
  }

  const res = await fetch(`${API_BASE}/invoices`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`تعذّر إنشاء فاتورة الدفع: ${res.status} ${detail.slice(0, 200)}`);
  }

  return (await res.json()) as MoyasarInvoice;
}

/** التحقق من حالة الفاتورة مباشرة من مُيسّر — لا نثق بمعطيات الرابط وحدها */
export async function fetchInvoice(invoiceId: string): Promise<MoyasarInvoice | null> {
  const res = await fetch(`${API_BASE}/invoices/${invoiceId}`, {
    headers: { Authorization: authHeader() },
    cache: 'no-store',
  });

  if (!res.ok) return null;
  return (await res.json()) as MoyasarInvoice;
}
