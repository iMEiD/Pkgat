import 'server-only';

/**
 * إرسال البريد عبر Resend.
 *
 * المنصة تعمل بدونه: إن لم يُضبط RESEND_API_KEY نُرجع 'skipped' بدل أن
 * نرمي استثناء — تعطُّل التذكير لا يجوز أن يُسقط أي مسار آخر.
 *
 * وعنوانان لا واحد:
 *
 *   EMAIL_FROM      المرسِل — عنوان آليّ لا يقرؤه أحد (no-reply@…)
 *   EMAIL_REPLY_TO  عنوان الردّ — صندوق يقرؤه بشر (hello@…)
 *
 * والفصل بينهما ضروري: العميل يستلم رسالة تفعيل ويردّ عليها بسؤال —
 * وهذا يقع كثيراً. فإن لم يكن للردّ عنوان ذهب الردّ إلى صندوق آليّ لا
 * يُفتح، أو ارتدّ. وهو عطل صامت: لا يظهر في سجلّ، ولا يشتكي منه أحد
 * لأن الشاكي هو من ضاع سؤاله.
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

  const replyTo = (process.env.EMAIL_REPLY_TO ?? '').trim();

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
        // يُحقن فقط إن ضُبط — Resend يرفض حقلاً فارغاً
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * قالب رسائل المنصة — مطابق لقوالب Supabase في supabase/email-templates
 * حتى تبدو كل رسائل بكجات من مصدر واحد.
 *
 * أنماط مضمّنة وخطوط نظام وتخطيط بجداول: عملاء البريد يتجاهلون <style>
 * ولا يحمّلون خطوطاً خارجية، وOutlook تحديداً لا يعوّل عليه في flex/grid.
 */
export function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html dir="rtl" lang="ar"><body style="margin:0;padding:0;background:#F5F1EA;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#F5F1EA;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:520px;background:#FFFFFF;border-radius:20px;overflow:hidden;
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Tahoma,Arial,sans-serif;">
        <tr>
          <td align="center" style="background:#6D4AFF;padding:24px;">
            <div style="font-size:22px;font-weight:bold;color:#FFFFFF;letter-spacing:3px;">PKGAT</div>
            <div style="font-size:13px;color:#E3DBFF;margin-top:2px;">بكجات</div>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 28px;" dir="rtl">
            <h1 style="margin:0 0 16px;font-size:20px;color:#2A2521;text-align:right;">${title}</h1>
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;background:#FDFAF4;border-top:1px solid #F2E9D9;">
            <p style="margin:0;font-size:11px;color:#8C8377;text-align:center;">
              بكجات — دعوات إلكترونية بباركود دخول
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
