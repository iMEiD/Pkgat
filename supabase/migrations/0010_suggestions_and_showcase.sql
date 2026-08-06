-- =============================================================
-- 0010 — صندوق الاقتراحات ومشاركة تصاميم العملاء
--
-- ١. suggestions: اقتراحات المستخدمين تصل للأدمن مع بيانات التواصل.
--    البيانات تُلتقط وقت الإرسال ولا تُقرأ من الملف لاحقاً، حتى يبقى
--    السجل صحيحاً لو غيّر صاحبه بريده أو حذف حسابه.
-- ٢. events.shared_design: موافقة صاحب المناسبة على عرض تصميمه في
--    الصفحة الرئيسية. الافتراضي false — المشاركة قرار صريح لا ضمني.
-- =============================================================

-- -------------------------------------------------------------
-- ١. الاقتراحات
-- -------------------------------------------------------------
create table if not exists public.suggestions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete set null,
  -- نسخة من بيانات التواصل وقت الإرسال، لا مرجع حيّ
  name        text,
  email       text,
  phone       text,
  category    text not null default 'other',  -- feature | bug | design | other
  message     text not null,
  status      text not null default 'new',    -- new | reviewed | done | dismissed
  admin_note  text,
  created_at  timestamptz not null default now()
);

create index if not exists suggestions_status_idx
  on public.suggestions (status, created_at desc);

alter table public.suggestions enable row level security;

-- أي مستخدم مسجّل يقدر يرسل اقتراحاً، ولا أحد يقرأ الاقتراحات إلا الأدمن
drop policy if exists suggestions_insert on public.suggestions;
create policy suggestions_insert on public.suggestions
  for insert with check (auth.uid() is not null);

drop policy if exists suggestions_admin_read on public.suggestions;
create policy suggestions_admin_read on public.suggestions
  for select using (public.is_super_admin());

drop policy if exists suggestions_admin_write on public.suggestions;
create policy suggestions_admin_write on public.suggestions
  for update using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists suggestions_admin_delete on public.suggestions;
create policy suggestions_admin_delete on public.suggestions
  for delete using (public.is_super_admin());

-- -------------------------------------------------------------
-- ٢. مشاركة التصميم في المعرض
-- -------------------------------------------------------------
alter table public.events
  add column if not exists shared_design boolean not null default false,
  add column if not exists shared_at     timestamptz;

comment on column public.events.shared_design is
  'وافق صاحب المناسبة على عرض تصميم دعوته في الصفحة الرئيسية';

-- المشاركة تعرض التصميم للعامة، فنحتاج سياسة قراءة عامة محدودة.
-- عرض مستقل يكشف الخلفية والعنوان فقط — لا المدعوين ولا أي شيء آخر.
create or replace view public.shared_designs
with (security_invoker = false) as
  select
    e.id,
    e.title,
    e.event_type,
    e.design ->> 'backgroundUrl' as background_url,
    e.shared_at
  from public.events e
  where e.shared_design
    and e.design ->> 'backgroundUrl' is not null
  order by e.shared_at desc nulls last;

-- الأدوار موجودة دائماً في Supabase؛ نحرسها فقط ليبقى الملف قابلاً
-- للتنفيذ على قاعدة PostgreSQL عادية عند الاختبار المحلي
do $$ begin
  grant select on public.shared_designs to anon, authenticated;
exception when undefined_object then null; end $$;
