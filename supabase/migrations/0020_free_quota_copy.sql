-- =============================================================
-- 0020 — تصحيح النصوص بعد صيرورة الحصة على الحساب
--
-- الترحيل 0019 جعل العشر دعوات للحساب كله. والنصوص المحفوظة في
-- site_content ما زالت تقول «في كل مناسبة» — وهي تتقدّم على القيم
-- الاحتياطية في الكود، فتبقى الوعود مخالفة لما يفرضه النظام فعلاً.
--
-- وعدٌ يخالف السلوك أسوأ من وعد ناقص: العميل يضيف مدعويه ثم يفاجأ.
-- =============================================================

update public.site_content
   set value = '"مجاناً قبل أي دفع"'::jsonb
 where key = 'home.stats.free_label';

update public.site_content
   set value = '"جرّب بكجات على أول ١٠ دعوات مجاناً"'::jsonb
 where key = 'home.cta.title';

update public.site_content
   set value = '"جرّب بأول ١٠ دعوات مجاناً، وادفع فقط لما تحتاج أكثر."'::jsonb
 where key = 'pricing.subtitle';

-- سؤال «وش معنى الدعوات المجانية؟» في الصفحتين — بنفس النص في الاثنتين
update public.site_content
   set value = (
     select jsonb_agg(
       case when item ->> 'q' = 'وش معنى الدعوات المجانية؟'
         then jsonb_build_object(
           'q', item ->> 'q',
           'a', 'تقدر تضيف أول ١٠ مدعوين وتولّد دعواتهم فعلياً بدون دفع — تجرّب المنصة كاملة قبل أي ريال. بعدها تختار الباقة اللي تناسبك.')
         else item
       end
       order by ord
     )
     from jsonb_array_elements(value) with ordinality as t(item, ord)
   )
 where key in ('pricing.faq', 'home.faq')
   and jsonb_typeof(value) = 'array';
