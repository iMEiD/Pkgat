-- =============================================================
-- 0006 — الجانب النظامي والمحتوى المبدئي
--
-- ١. موافقة المستخدم على الشروط والاستخدام التسويقي (نظام حماية
--    البيانات الشخصية — PDPL): الموافقة تُلتقط وقت التسجيل وتُخزَّن
--    بختم زمني، لأن «الموافقة الصريحة» يجب أن تكون مُثبتة لا مفترضة.
-- ٢. نصوص صفحتَي الشروط والخصوصية كبيانات قابلة للتعديل من لوحة الأدمن.
-- ٣. القوالب الجاهزة الستة ومعرض النماذج — الجدولان كانا فارغين،
--    فكان المستخدم الجديد يفتح خطوة التصميم ولا يجد أي قالب.
-- =============================================================

-- -------------------------------------------------------------
-- ١. أعمدة الموافقة على ملف المستخدم
-- -------------------------------------------------------------
alter table public.profiles
  add column if not exists terms_accepted_at    timestamptz,
  add column if not exists marketing_consent    boolean not null default false,
  add column if not exists marketing_consent_at timestamptz;

comment on column public.profiles.terms_accepted_at is
  'وقت قبول الشروط وسياسة الخصوصية عند التسجيل';
comment on column public.profiles.marketing_consent is
  'موافقة صريحة على استخدام بيانات التواصل لأغراض تسويقية (PDPL)';

-- التسجيل يمرّر الموافقة ضمن بيانات المستخدم، والمُشغّل يثبّتها بختم زمني
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marketing boolean := coalesce(
    (new.raw_user_meta_data ->> 'marketing_consent')::boolean, false
  );
begin
  insert into public.profiles (
    id, email, full_name,
    terms_accepted_at, marketing_consent, marketing_consent_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    -- قبول الشروط شرط لإتمام التسجيل، فوقت الإنشاء هو وقت القبول
    now(),
    v_marketing,
    case when v_marketing then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- -------------------------------------------------------------
-- ٢. نصوص الصفحات النظامية
-- -------------------------------------------------------------
insert into public.site_content (key, page, label, kind, value, sort_order) values
  ('terms.title', 'terms', 'عنوان صفحة الشروط', 'text', '"الشروط والأحكام"'::jsonb, 10),
  ('terms.lead', 'terms', 'النص التعريفي', 'text',
   '"باستخدامك منصة بكجات فإنك توافق على الشروط التالية. نرجو قراءتها قبل إنشاء حسابك."'::jsonb, 20),
  ('terms.updated', 'terms', 'تاريخ آخر تحديث', 'text', '"آخر تحديث: ٥ أغسطس ٢٠٢٦"'::jsonb, 30),
  ('terms.sections', 'terms', 'بنود الشروط (قائمة)', 'list',
   '[{"title":"طبيعة الخدمة","body":"بكجات منصة تتيح لك تصميم دعوات إلكترونية، وتوليد باركود دخول فريد لكل مدعو، وإدارة دخول ضيوفك وقت المناسبة. المنصة أداة تنظيمية ولا تتحمل مسؤولية تنظيم المناسبة نفسها أو ما يجري فيها."},
     {"title":"الحساب ومسؤوليتك عنه","body":"أنت مسؤول عن صحة البيانات التي تدخلها وعن الحفاظ على سرية كلمة مرورك. أي نشاط يتم عبر حسابك يُعد صادراً عنك. أبلغنا فوراً إذا اشتبهت في استخدام غير مصرّح به لحسابك."},
     {"title":"بيانات المدعوين","body":"أنت المتحكم في بيانات مدعويك، وتقرّ بأن لديك الأساس النظامي لجمعها ورفعها على المنصة. تعمل بكجات كمعالج لهذه البيانات نيابة عنك، ولا تستخدمها لأي غرض خارج تشغيل الخدمة."},
     {"title":"الباقات والدفع","body":"تُعرض أسعار الباقات شاملة ما يترتب عليها من رسوم. تتم عمليات الدفع عبر بوابة دفع خارجية معتمدة، ولا تمر بيانات بطاقتك على خوادمنا إطلاقاً."},
     {"title":"الاسترجاع","body":"يمكنك طلب استرجاع المبلغ خلال ١٤ يوماً من الشراء ما لم تكن المناسبة قد بدأت أو تم توليد الدعوات فعلياً. تُعاد المبالغ بنفس وسيلة الدفع."},
     {"title":"الاستخدام غير المقبول","body":"يُمنع استخدام المنصة في أي غرض مخالف للأنظمة، أو لإرسال محتوى مضلل أو مسيء، أو لمحاولة اختراق الخدمة أو تعطيلها. نحتفظ بحق تعليق أي حساب يخالف ذلك."},
     {"title":"توفر الخدمة","body":"نسعى لإتاحة المنصة دون انقطاع، لكننا لا نضمن خلوها من الأعطال. ننصح دائماً بتجربة المسح قبل موعد المناسبة بوقت كافٍ، وبتحميل نسخة من دعواتك."},
     {"title":"تعديل الشروط","body":"قد نحدّث هذه الشروط، وسننشر تاريخ آخر تحديث أعلى الصفحة. استمرارك في استخدام المنصة بعد التحديث يُعد قبولاً به."}]'::jsonb, 40),

  ('privacy.title', 'privacy', 'عنوان صفحة الخصوصية', 'text', '"سياسة الخصوصية"'::jsonb, 10),
  ('privacy.lead', 'privacy', 'النص التعريفي', 'text',
   '"نوضّح هنا أي بيانات نجمعها، ولماذا، ومن يطّلع عليها، وكيف تتحكم أنت فيها."'::jsonb, 20),
  ('privacy.updated', 'privacy', 'تاريخ آخر تحديث', 'text', '"آخر تحديث: ٥ أغسطس ٢٠٢٦"'::jsonb, 30),
  ('privacy.sections', 'privacy', 'بنود سياسة الخصوصية (قائمة)', 'list',
   '[{"title":"البيانات التي نجمعها منك","body":"عند التسجيل نجمع اسمك وبريدك الإلكتروني. وعند إنشاء مناسبة نحفظ بياناتها وتصميم الدعوة وقائمة المدعوين التي ترفعها أنت."},
     {"title":"بيانات المدعوين","body":"نحفظ اسم كل مدعو ومعرّف الباركود الخاص به ووقت دخوله إن تم مسحه. لا نشارك هذه البيانات مع أي جهة، ولا نستخدمها لأي غرض عدا تشغيل مناسبتك."},
     {"title":"لماذا نجمعها","body":"لتشغيل الخدمة: توليد الدعوات، التحقق من الدخول، وإصدار تقرير الحضور. ولا نستخدم بياناتك لأغراض تسويقية إلا بموافقتك الصريحة التي يمكنك سحبها متى شئت."},
     {"title":"مدة الحفظ","body":"تبقى بيانات مناسبتك متاحة لك في لوحتك ما دام حسابك قائماً. عند حذف الحساب تُحذف بياناته وبيانات مدعويه."},
     {"title":"من يطّلع على بياناتك","body":"أنت ومن تمنحهم صلاحية المسح في مناسبتك. ويطّلع فريق التشغيل على الحد الأدنى اللازم للدعم الفني أو معالجة عطل، ضمن التزام بالسرية."},
     {"title":"مزوّدو الخدمة","body":"نعتمد على مزوّدين خارجيين للاستضافة وقاعدة البيانات وبوابة الدفع وإرسال البريد. يعالج هؤلاء البيانات نيابة عنا وفق اتفاقيات تحفظ سريتها."},
     {"title":"حقوقك","body":"لك حق الاطلاع على بياناتك وتصحيحها وطلب حذفها، وحق سحب موافقتك على الاستخدام التسويقي في أي وقت. تواصل معنا عبر بريد الدعم لتنفيذ أي من ذلك."},
     {"title":"حماية البيانات","body":"الاتصال بالمنصة مشفّر، وكلمات المرور مخزّنة مُجزّأة، والوصول لبيانات كل حساب محكوم بسياسات صلاحيات على مستوى قاعدة البيانات."}]'::jsonb, 40)
on conflict (key) do nothing;

-- وصف المعرض: نماذج تصاميم — لا أعمال عملاء فعلية
update public.site_content
   set value = '"نماذج من التصاميم الجاهزة على المنصة — تقدر تستخدمها كما هي أو تعدّلها على ذوقك."'::jsonb
 where key = 'gallery.subtitle';

-- -------------------------------------------------------------
-- ٣. القوالب الجاهزة
--
-- الصور ملفات ثابتة داخل المشروع (public/templates) لا في التخزين،
-- فهي جزء من المنصة نفسها ولا تحتاج رفعاً يدوياً بعد كل نشر.
-- config يحمل طبقتَي الاسم والباركود فقط — الخلفية تُقرأ من background_url.
-- -------------------------------------------------------------
insert into public.templates (category_id, name, background_url, thumbnail_url, config, is_active, sort_order)
select c.id, t.name, t.bg, t.thumb, t.config, true, t.sort_order
from (values
  ('wedding', 'عرس — ذهبي كلاسيكي',
   '/templates/wedding-gold.jpg', '/templates/wedding-gold-thumb.jpg',
   '{"source":"template","width":1080,"height":1920,
     "name":{"sample":"اسم المدعو","x":0.5,"y":0.62,"fontFamily":"Aref Ruqaa","fontSize":0.062,
             "color":"#6B4E16","weight":700,"align":"center","letterSpacing":0,"shadow":false},
     "qr":{"x":0.5,"y":0.84,"size":0.24,"foreground":"#3A2E10","background":"#FFFFFF",
           "margin":2,"rounded":false,"visible":true},
     "extras":[]}'::jsonb, 10),

  ('wedding', 'عرس — وردي ناعم',
   '/templates/wedding-blush.jpg', '/templates/wedding-blush-thumb.jpg',
   '{"source":"template","width":1080,"height":1920,
     "name":{"sample":"اسم المدعو","x":0.5,"y":0.62,"fontFamily":"Amiri","fontSize":0.062,
             "color":"#8C3D5B","weight":700,"align":"center","letterSpacing":0,"shadow":false},
     "qr":{"x":0.5,"y":0.84,"size":0.24,"foreground":"#5C2038","background":"#FFFFFF",
           "margin":2,"rounded":false,"visible":true},
     "extras":[]}'::jsonb, 20),

  ('graduation', 'تخرج — كحلي أكاديمي',
   '/templates/graduation-navy.jpg', '/templates/graduation-navy-thumb.jpg',
   '{"source":"template","width":1080,"height":1920,
     "name":{"sample":"اسم المدعو","x":0.5,"y":0.62,"fontFamily":"Noto Kufi Arabic","fontSize":0.058,
             "color":"#12224A","weight":700,"align":"center","letterSpacing":0,"shadow":false},
     "qr":{"x":0.5,"y":0.84,"size":0.24,"foreground":"#12224A","background":"#FFFFFF",
           "margin":2,"rounded":false,"visible":true},
     "extras":[]}'::jsonb, 30),

  ('party', 'حفل — احتفالي ملوّن',
   '/templates/party-confetti.jpg', '/templates/party-confetti-thumb.jpg',
   '{"source":"template","width":1080,"height":1920,
     "name":{"sample":"اسم المدعو","x":0.5,"y":0.62,"fontFamily":"Marhey","fontSize":0.06,
             "color":"#2A2521","weight":700,"align":"center","letterSpacing":0,"shadow":false},
     "qr":{"x":0.5,"y":0.84,"size":0.24,"foreground":"#000000","background":"#FFFFFF",
           "margin":2,"rounded":false,"visible":true},
     "extras":[]}'::jsonb, 40),

  ('general', 'عام — بيج مينيمال',
   '/templates/general-sand.jpg', '/templates/general-sand-thumb.jpg',
   '{"source":"template","width":1080,"height":1920,
     "name":{"sample":"اسم المدعو","x":0.5,"y":0.62,"fontFamily":"IBM Plex Sans Arabic","fontSize":0.056,
             "color":"#3A322A","weight":600,"align":"center","letterSpacing":0,"shadow":false},
     "qr":{"x":0.5,"y":0.84,"size":0.24,"foreground":"#2A2521","background":"#FFFFFF",
           "margin":2,"rounded":false,"visible":true},
     "extras":[]}'::jsonb, 50),

  ('general', 'عام — أخضر فاخر',
   '/templates/general-emerald.jpg', '/templates/general-emerald-thumb.jpg',
   '{"source":"template","width":1080,"height":1920,
     "name":{"sample":"اسم المدعو","x":0.5,"y":0.62,"fontFamily":"Reem Kufi","fontSize":0.06,
             "color":"#0C3B30","weight":600,"align":"center","letterSpacing":0,"shadow":false},
     "qr":{"x":0.5,"y":0.84,"size":0.24,"foreground":"#0C3B30","background":"#FFFFFF",
           "margin":2,"rounded":false,"visible":true},
     "extras":[]}'::jsonb, 60)
) as t(cat_slug, name, bg, thumb, config, sort_order)
join public.template_categories c on c.slug = t.cat_slug
where not exists (select 1 from public.templates x where x.name = t.name);

-- -------------------------------------------------------------
-- ٤. معرض النماذج
-- -------------------------------------------------------------
insert into public.gallery_items (title, description, image_url, event_type, is_published, sort_order)
select t.title, t.description, t.image_url, t.event_type, true, t.sort_order
from (values
  ('دعوة عرس — ذهبي كلاسيكي', 'إطار ذهبي وزخرفة هندسية، مع مساحة هادئة لاسم المدعو والباركود.',
   '/templates/wedding-gold.jpg', 'wedding', 10),
  ('دعوة عرس — وردي ناعم', 'تدرّج وردي هادئ وزهرة مركزية — مناسب للمناسبات النسائية.',
   '/templates/wedding-blush.jpg', 'wedding', 20),
  ('دعوة تخرج — كحلي أكاديمي', 'كحلي وذهبي بقبعة تخرج، بتدرّج يفتح تدريجياً نحو الأسفل.',
   '/templates/graduation-navy.jpg', 'graduation', 30),
  ('دعوة حفل — احتفالي ملوّن', 'قصاصات ملوّنة على خلفية فاتحة — مرح ومناسب لأعياد الميلاد.',
   '/templates/party-confetti.jpg', 'party', 40),
  ('دعوة عامة — بيج مينيمال', 'قوس معماري بخطوط رفيعة على بيج فاتح، بسيط ويناسب كل المناسبات.',
   '/templates/general-sand.jpg', 'other', 50),
  ('دعوة عامة — أخضر فاخر', 'أخضر داكن مع نقش ذهبي — طابع فاخر ورسمي.',
   '/templates/general-emerald.jpg', 'other', 60)
) as t(title, description, image_url, event_type, sort_order)
where not exists (select 1 from public.gallery_items g where g.title = t.title);
