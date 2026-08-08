-- =============================================================
-- 0012 — خطوط مرفوعة من لوحة الأدمن
--
-- قائمة الخطوط كانت ثابتة في الكود ومحدودة بما تتيحه Google Fonts.
-- الآن يقدر الأدمن يرفع أي ملف خط (woff2/woff/ttf/otf) فيظهر لكل
-- المستخدمين في محرّر التصميم إلى جانب الخطوط الجاهزة.
-- =============================================================

create table if not exists public.custom_fonts (
  id          uuid primary key default gen_random_uuid(),
  -- الاسم المستخدم في CSS font-family — لا بد أن يكون فريداً حتى لا
  -- يتعارض خطّان في نفس الصفحة ويظهر أحدهما مكان الآخر
  family      text not null unique,
  label       text not null,
  file_url    text not null,
  /* woff2 | woff | truetype | opentype — نمرّره لـ FontFace كتلميح صيغة */
  format      text not null default 'woff2',
  weight      integer not null default 400,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists custom_fonts_active_idx
  on public.custom_fonts (is_active, sort_order);

alter table public.custom_fonts enable row level security;

-- الخطوط تُقرأ في محرّر التصميم لكل مستخدم، وتُدار من الأدمن وحده
drop policy if exists custom_fonts_public_read on public.custom_fonts;
create policy custom_fonts_public_read on public.custom_fonts
  for select using (is_active or public.is_super_admin());

drop policy if exists custom_fonts_admin_write on public.custom_fonts;
create policy custom_fonts_admin_write on public.custom_fonts
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- -------------------------------------------------------------
-- مخزن ملفات الخطوط
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('fonts', 'fonts', true)
on conflict (id) do nothing;

drop policy if exists fonts_public_read on storage.objects;
create policy fonts_public_read on storage.objects
  for select using (bucket_id = 'fonts');

drop policy if exists fonts_admin_write on storage.objects;
create policy fonts_admin_write on storage.objects
  for all
  using (bucket_id = 'fonts' and public.is_super_admin())
  with check (bucket_id = 'fonts' and public.is_super_admin());
