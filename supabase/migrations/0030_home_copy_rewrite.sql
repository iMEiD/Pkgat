-- =============================================================
-- 0030 — إعادة كتابة نصوص الصفحة الرئيسية
--
-- النصّ السابق كان يصف ما تفعله المنصة. وهذا يصف ما يكسبه صاحب
-- المناسبة: «كل مدعو بباركوده، وتعرف مين حضر».
-- الأول وصفُ أداة، والثاني وعدُ نتيجة — والزائر يشتري النتيجة.
--
-- والنصوص المحفوظة تتقدّم على القيم الاحتياطية في الكود، فتغييرها هنا
-- شرطٌ لوصول النصّ الجديد — تعديل الكود وحده لا يُظهر شيئاً.
-- =============================================================

-- ===================== البطل =====================

update public.site_content set value = '"باركود دخول لكل مدعو"'::jsonb
 where key = 'home.hero.eyebrow';

update public.site_content
   set value = '"كل مدعو بباركوده، وتعرف مين حضر"'::jsonb
 where key = 'home.hero.title';

update public.site_content
   set value = '"ارفع دعوتك الحالية بأي تصميم، ونولّد باركود دخول فريد لكل مدعو باسمه. على الباب تمسحه من جوالك وبس، وتشوف الحضور لحظة بلحظة — بدون طابعة، بدون تطبيق، بدون فوضى."'::jsonb
 where key = 'home.hero.subtitle';

update public.site_content set value = '"ابدأ مجاناً"'::jsonb
 where key = 'home.hero.primary_cta';

update public.site_content set value = '"شاهد كيف تشتغل"'::jsonb
 where key = 'home.hero.secondary_cta';

-- ===================== الشريط تحت البطل =====================
--
-- ثلاث بطاقات هنا، والرابعة (التجربة المجانية) يضيفها الكود لأنها
-- تقرأ رقم الحصة من الإعدادات — فيتغيّر النص إن غُيّر الرقم.

update public.site_content
   set value = '[{"value":"ارفعها كما هي","label":"أي تصميم من مصمّمك أو جاهز"},
                 {"value":"باركود لكل مدعو","label":"فريد وغير قابل للتخمين"},
                 {"value":"بدون تطبيق","label":"المسح من متصفح الجوال مباشرة"}]'::jsonb
 where key = 'home.stats';

update public.site_content set value = '"قبل أي التزام مالي"'::jsonb
 where key = 'home.stats.free_label';

-- ===================== قسم المعاينة (قبل/بعد) =====================
--
-- كان نصّه مكتوباً في الكود لا في قاعدة البيانات، فلا يملك الأدمن
-- تغييره. وصار مفتاحين كبقية النصوص.

insert into public.site_content (key, page, label, kind, value) values
  ('home.showcase.eyebrow', 'home', 'عنوان مصغّر فوق معاينة قبل/بعد', 'text',
   '"نفس التصميم، بإضافة واحدة بسيطة"'::jsonb),
  ('home.showcase.body', 'home', 'شرح تحت معاينة قبل/بعد', 'text',
   '"ما نعيد تصميم دعوتك. نضيف عليها طبقة ذكية: باركود مربوط باسم المدعو، تتحكم بمكانه وحجمه ولونه بنفسك."'::jsonb)
on conflict (key) do update set value = excluded.value, label = excluded.label;

-- ===================== المميزات =====================

update public.site_content set value = '"المميزات"'::jsonb
 where key = 'home.features.eyebrow';

update public.site_content
   set value = '"مصمم عشان يحل مشكلة حقيقية، مو بس يبهرك"'::jsonb
 where key = 'home.features.title';

update public.site_content
   set value = '[{"icon":"qr","color":"grape","title":"باركود فريد لكل مدعو","body":"معرّف عشوائي غير قابل للتخمين أو النسخ — تحدد مكانه ولونه وحجمه بنفسك."},
     {"icon":"upload","color":"coral","title":"يشتغل مع أي تصميم","body":"دعوة من مصمم خاص، أو جاهزة، أو من قوالبنا — النظام يتكيف مع تصميمك، مو العكس."},
     {"icon":"shield","color":"rose","title":"منع الدخول المكرر تلقائياً","body":"الباركود يُستهلك بعد أول مسح، مع زر تجاوز مسجَّل باسم المسؤول للحالات الاستثنائية."},
     {"icon":"users","color":"mint","title":"فريق استقبال بلا تعقيد","body":"كل مسؤول دخول يفتح رابط المسح من جواله مباشرة، وكل عملية تُسجَّل باسمه."},
     {"icon":"chart","color":"sunny","title":"تقرير حضور جاهز فور انتهاء المناسبة","body":"نسبة الحضور، تفصيل حسب الفئة، جاهز للطباعة أو حفظ PDF."},
     {"icon":"edit","color":"sky","title":"تعديلات خفيفة وقت الحاجة","body":"غيّرت اسم مدعو أو أضفت تفصيل؟ تعديل بسيط على دعوتك، مو مشروع تصميم من الصفر."}]'::jsonb
 where key = 'home.features.items';

-- ===================== الخطوات =====================

update public.site_content set value = '"كيف تشتغل"'::jsonb
 where key = 'home.steps.eyebrow';

update public.site_content
   set value = '"من الرفع للباب، أربع خطوات وخلصت"'::jsonb
 where key = 'home.steps.title';

update public.site_content
   set value = '[{"title":"ارفع دعوتك","body":"جاهزة عندك، أو ابدأ من قالب."},
     {"title":"حدد مكان الباركود","body":"اسحبه بإصبعك، مع اسم المدعو."},
     {"title":"أضف قائمة المدعوين","body":"اكتبها، الصقها، أو استورد ملف."},
     {"title":"وزّع وامسح","body":"حمّل الدعوات وأرسلها، وامسح على الباب."}]'::jsonb
 where key = 'home.steps.items';

-- ===================== الأسئلة الشائعة =====================

update public.site_content
   set value = '[{"q":"هل الباركود يحتاج إنترنت؟","a":"نعم، لوحة المسح تحتاج اتصال خفيف للتحقق الفوري ومنع التكرار — وهي مصممة تشتغل حتى مع شبكة ضعيفة."},
     {"q":"وش معنى الدعوات المجانية؟","a":"أول ١٠ مدعوين مجاناً بالكامل — تولد دعواتهم وتجرب النظام فعلياً قبل أي دفع."},
     {"q":"أقدر أضيف أكثر من مسؤول استقبال؟","a":"نعم، حساب مسح مستقل لكل مدخل، وكل عملية مسح مسجّلة باسم المسؤول."},
     {"q":"هل المدعو يحمّل تطبيق؟","a":"لا. يستلم دعوته كصورة عادية، ومسؤول الاستقبال يمسحها من متصفح جواله — بدون تطبيق على الطرفين."}]'::jsonb
 where key = 'home.faq';

-- ===================== الدعوة الختامية =====================

update public.site_content set value = '"جرّبها الآن بلا مخاطرة"'::jsonb
 where key = 'home.cta.title';

update public.site_content
   set value = '"ارفع دعوتك وولّد أول ١٠ باركودات فعلياً — قبل ما تدفع ريال واحد."'::jsonb
 where key = 'home.cta.body';

update public.site_content set value = '"أنشئ حسابك"'::jsonb
 where key = 'home.cta.primary';

update public.site_content set value = '"شاهد الباقات"'::jsonb
 where key = 'home.cta.secondary';
