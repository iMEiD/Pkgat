-- =============================================================
-- 0023 — تقييمات العملاء
--
-- المسار: العميل يقيّم الخدمة من لوحته ← التقييم يصل صاحب المنصة في
-- «التقييمات» بحالة «بانتظار المراجعة» ← يقرّر هو نشره للزوار أو لا.
-- ويقدر يضيف تقييمات من عنده لأعمال نُفِّذت خارج المنصة.
--
-- القاعدة الحاكمة: لا شيء يظهر للزائر إلا بموافقة صريحة. النشر قرار
-- صاحب المنصة وحده، ولهذا لا يكفي أن نكتب `status` ونثق: حارسٌ قبل
-- الكتابة يمنع المتصفح من نشر نفسه — وإلا كتب أي مستخدم مسجَّل ما
-- يشاء في الصفحة الرئيسية.
--
-- والاسم يُنسخ وقت الإرسال لا يُقرأ من الملف: لو حذف صاحبه حسابه بقي
-- التقييم مفهوماً، ولو غيّر اسمه لم يتغيّر ما نُشر باسمه.
-- =============================================================

create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles (id) on delete set null,

  -- نسخة وقت الإرسال، لا مرجع حيّ
  author_name  text not null,
  -- صفة تُعرّف صاحب الرأي: «صاحب مناسبة زواج» · «منظّم مؤتمر»
  author_title text,

  rating       smallint not null check (rating between 1 and 5),
  body         text not null check (char_length(body) between 10 and 1000),

  -- pending: وصل ولم يُراجَع · published: ظاهر للزوار · hidden: مرفوض أو مسحوب
  status       text not null default 'pending'
               check (status in ('pending', 'published', 'hidden')),

  -- customer: كتبه صاحبه · admin: أضافه صاحب المنصة بنفسه
  source       text not null default 'customer' check (source in ('customer', 'admin')),

  -- ترتيب العرض في الرئيسية — الأصغر أولاً
  sort_order   integer not null default 0,

  admin_note   text,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists reviews_status_idx
  on public.reviews (status, sort_order, created_at desc);

-- تقييم واحد لكل حساب: الرأي يُحدَّث ولا يُكرَّر. وبدونه يستطيع حساب
-- واحد أن يملأ الصندوق ويغرق ما عداه.
create unique index if not exists reviews_one_per_user
  on public.reviews (user_id)
  where user_id is not null and source = 'customer';

alter table public.reviews enable row level security;

-- -------------------------------------------------------------
-- السياسات
-- -------------------------------------------------------------
drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews
  for insert with check (auth.uid() is not null and user_id = auth.uid());

-- يقرأ تقييمه هو (ليرى حالته)، والمنشور مقروء للجميع عبر العرض العام
drop policy if exists reviews_select_own on public.reviews;
create policy reviews_select_own on public.reviews
  for select using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists reviews_admin_write on public.reviews;
create policy reviews_admin_write on public.reviews
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- -------------------------------------------------------------
-- حارس النشر
--
-- السياسات أعلاه تسمح لصاحب التقييم بتعديل صفّه، وسياسات RLS تعمل على
-- مستوى الصف لا العمود — فلا تفرّق بين تعديل نصّه وتغيير حالته إلى
-- «منشور». وهو نفس الخلل الذي سُدّ في 0018 للصلاحيات والحدود.
--
-- security invoker عمداً: definer تبدّل current_user لمالك الدالة
-- فيصير الحارس أعمى عن هوية المنفّذ ويمرّر كل شيء.
-- -------------------------------------------------------------
create or replace function public.guard_review_publication()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- مسارات الأدمن تمرّ بمفتاح الخدمة، وهي وحدها المخوّلة بالنشر
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- ما يرسله المتصفح من حالة أو ترتيب أو مصدر يُهمَل تماماً
    new.status       := 'pending';
    new.source       := 'customer';
    new.sort_order   := 0;
    new.published_at := null;
    new.admin_note   := null;
    return new;
  end if;

  if new.status     is distinct from old.status
  or new.source     is distinct from old.source
  or new.sort_order is distinct from old.sort_order
  or new.admin_note is distinct from old.admin_note
  or new.user_id    is distinct from old.user_id then
    raise exception 'لا يجوز نشر التقييم أو تعديل حالته من المتصفح'
      using errcode = '42501';
  end if;

  -- تعديل الرأي يعيده للمراجعة: نصٌّ نُشر ثم تغيّر لم يُوافَق عليه
  if new.body is distinct from old.body or new.rating is distinct from old.rating then
    new.status       := 'pending';
    new.published_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists reviews_publication_guard on public.reviews;
create trigger reviews_publication_guard
  before insert or update on public.reviews
  for each row execute function public.guard_review_publication();

-- -------------------------------------------------------------
-- العرض العام
--
-- يكشف ما يظهر على البطاقة فقط: لا user_id ولا ملاحظة الأدمن ولا
-- حالة المراجعة. والزائر لا يحتاج أياً منها.
-- -------------------------------------------------------------
create or replace view public.published_reviews
with (security_invoker = false) as
  select
    r.id,
    r.author_name,
    r.author_title,
    r.rating,
    r.body,
    r.published_at,
    r.sort_order
  from public.reviews r
  where r.status = 'published'
  order by r.sort_order, r.published_at desc nulls last;

do $$ begin
  grant select on public.published_reviews to anon, authenticated;
exception when undefined_object then null; end $$;

-- -------------------------------------------------------------
-- نصوص القسم في الرئيسية — قابلة للتعديل من لوحة المحتوى
-- -------------------------------------------------------------
insert into public.site_content (key, page, label, kind, value, sort_order) values
  ('home.reviews.eyebrow', 'home', 'قسم التقييمات — العنوان الصغير', 'text',
   '"رأي عملائنا"'::jsonb, 70),
  ('home.reviews.title', 'home', 'قسم التقييمات — العنوان', 'text',
   '"وش يقولون اللي جرّبوا بكجات؟"'::jsonb, 71),
  ('home.reviews.subtitle', 'home', 'قسم التقييمات — الوصف', 'text',
   '"تقييمات كتبها أصحاب مناسبات نُظِّمت فعلاً على المنصة."'::jsonb, 72)
on conflict (key) do nothing;
