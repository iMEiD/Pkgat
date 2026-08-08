import QRCode from 'qrcode';

/**
 * باركود يشير لموقع بكجات — للعرض في بطاقات المعرض.
 *
 * بطاقات المعرض تعرض الدعوة كما يراها المدعو فعلاً، وباركودها جزء
 * أصيل من شكلها. لكنه هنا لا يجوز أن يكون باركود مدعو حقيقي، فنضع
 * باركود الموقع نفسه: يبقى الشكل صادقاً، ومن يمسحه يصل لبكجات.
 *
 * يُولَّد على الخادم مرة واحدة لكل طلب صفحة — لا مرة لكل بطاقة.
 */
export const SITE_QR_TARGET = 'https://www.pkgat.com';

export async function siteQrDataUrl(): Promise<string | null> {
  try {
    return await QRCode.toDataURL(SITE_QR_TARGET, {
      errorCorrectionLevel: 'M',
      margin: 0,
      scale: 6,
      color: { dark: '#141019ff', light: '#ffffffff' },
    });
  } catch {
    // الباركود زينة في هذا السياق — فشله لا يمنع عرض المعرض
    return null;
  }
}
