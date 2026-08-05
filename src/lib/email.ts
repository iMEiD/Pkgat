import 'server-only';

/**
 * إرسال البريد عبر Resend.
 *
 * المنصة تعمل بدونه: إن لم يُضبط RESEND_API_KEY نُرجع 'skipped' بدل أن
 * نرمي استثناء — تعطُّل التذكير لا يجوز أن يُسقط أي مسار آخر.
 */

const API = 'https://api.resend.com/emails';

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export type SendResult = 'sent' | 'skipped' | 'failed';

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  if (!isEmailConfigured()) return 'skipped';

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
    });

    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

/** قالب بسيط بالعربية — RTL وخط النظام، فلا يعتمد على تحميل خطوط خارجية */
export function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html dir="rtl" lang="ar"><body style="margin:0;padding:24px;background:#F5F1EA;
  font-family:-apple-system,'Segoe UI',Tahoma,sans-serif;color:#2A2521">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;padding:28px">
    <h1 style="margin:0 0 16px;font-size:20px">${title}</h1>
    ${bodyHtml}
    <p style="margin-top:28px;padding-top:16px;border-top:1px solid #E8E1D5;
       font-size:12px;color:#8A8177">بكجات — دعوات إلكترونية بباركود دخول</p>
  </div>
</body></html>`;
}
