-- =============================================================
-- 0017 — رقم واتساب الدعم، وتوضيح صيغة حقول التواصل
--
-- زر الواتساب العائم كان يظهر ولا يفتح شيئاً: الرقم بالصيغة المحلية
-- (0551221129) يُمرَّر كما هو إلى wa.me، وهو لا يقبل إلا الصيغة الدولية
-- بأرقام مجرّدة — فيفتح واتساب ويقول إن الرقم غير صالح.
--
-- الكود صار يصحّح الصيغة بنفسه، وهذا الترحيل يضبط الرقم الفعلي ويوضّح
-- الصيغة في أسماء الحقول حتى لا تلتبس عند التعديل لاحقاً.
-- =============================================================

-- الرقم يُضبط فقط إن كان الحقل فارغاً، فلا يُلغى ما ضبطه صاحب المنصة
update public.site_settings
   set value = '"966551221129"'::jsonb
 where key = 'support_whatsapp'
   and coalesce(trim(both '"' from value::text), '') = '';

-- أسماء أوضح: الحقل يقول صيغته بنفسه
update public.site_settings
   set label = 'رقم واتساب الدعم — بالصيغة الدولية بلا + مثل 966551221129'
 where key = 'support_whatsapp';

update public.site_settings
   set label = 'بريد الدعم — يظهر في الفوتر'
 where key = 'support_email';

update public.site_settings
   set label = 'رابط انستقرام كاملاً — https://instagram.com/... (فارغ = يُخفى)'
 where key = 'instagram_url';

update public.site_settings
   set label = 'رابط X كاملاً — https://x.com/... (فارغ = يُخفى)'
 where key = 'x_url';
