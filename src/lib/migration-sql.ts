/**
 * نصوص الترحيلات كما هي في supabase/migrations.
 *
 * ⚠️ ملف مولّد — لا يُحرَّر يدوياً.
 * أعد توليده بعد أي تعديل على الترحيلات:
 *   node scripts/generate-migration-sql.mjs
 */

export const MIGRATION_SQL: Record<string, string> = {
  '0001_init.sql': `-- =============================================================
-- بكجات (PKGAT) — المخطط الأساسي لقاعدة البيانات
-- منصة دعوات إلكترونية بباركود دخول
-- =============================================================

create extension if not exists "pgcrypto";

-- =============================================================
-- 1. الحسابات والصلاحيات
-- =============================================================

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text,
  full_name     text,
  phone         text,
  is_super_admin boolean not null default false,
  is_suspended  boolean not null default false,
  -- تحقق بخطوتين (TOTP) — إلزامي عملياً لحساب الأدمن
  totp_secret   text,
  totp_enabled  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'ملف المستخدم الممتد لجدول auth.users';

-- إنشاء الملف تلقائياً عند تسجيل مستخدم جديد
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- دالة مساعدة: هل المستخدم الحالي أدمن؟
-- security definer لتفادي الرجوع التكراري داخل سياسات RLS على profiles
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_super_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- =============================================================
-- 2. المناسبات
-- =============================================================

do $$ begin
  create type public.event_status as enum ('draft', 'ready', 'live', 'ended', 'archived');
exception when duplicate_object then null; end $$;

create table if not exists public.events (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  title          text not null,
  event_type     text not null default 'other',   -- wedding | graduation | party | other
  starts_at      timestamptz not null,
  ends_at        timestamptz,
  venue          text,
  notes          text,
  status         public.event_status not null default 'draft',

  -- إعدادات التصميم (القالب/الرفع الخاص + موضع الاسم + إعدادات الباركود)
  design         jsonb not null default '{}'::jsonb,
  template_id    uuid,

  -- نافذة صلاحية الباركود (تُدار من الخادم وليس من ساعة الجهاز)
  activation_lead_minutes  integer not null default 120,   -- يفعّل قبل البداية بساعتين
  expiry_grace_minutes     integer not null default 1440,  -- ينتهي بعد النهاية بيوم

  -- الحد التجريبي المجاني ومعلومات الدفع
  free_quota     integer not null default 10,
  is_paid        boolean not null default false,
  paid_at        timestamptz,
  plan_id        uuid,

  ended_manually_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists events_owner_idx on public.events (owner_id, created_at desc);
create index if not exists events_starts_idx on public.events (starts_at);

-- الوقت الافتراضي للنهاية: 6 ساعات بعد البداية إن لم يُحدَّد
create or replace function public.event_effective_end(e public.events)
returns timestamptz
language sql
immutable
as $$
  select coalesce(e.ended_manually_at, e.ends_at, e.starts_at + interval '6 hours');
$$;

-- =============================================================
-- 3. فئات المدعوين (Tags)
-- =============================================================

create table if not exists public.event_tags (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  name       text not null,
  color      text not null default 'grape',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, name)
);

create index if not exists event_tags_event_idx on public.event_tags (event_id, sort_order);

-- =============================================================
-- 4. المدعوون والباركودات
-- =============================================================

create table if not exists public.guests (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  name          text not null,
  phone         text,
  tag_id        uuid references public.event_tags (id) on delete set null,
  seats         integer not null default 1,

  -- المعرّف الفريد غير القابل للتخمين المطبوع في الـ QR
  code          uuid not null default gen_random_uuid(),

  checked_in_at timestamptz,
  checked_in_by uuid,            -- scanner_accounts.id
  entries_count integer not null default 0,

  created_at    timestamptz not null default now(),
  unique (code)
);

create index if not exists guests_event_idx on public.guests (event_id, created_at);
create index if not exists guests_tag_idx on public.guests (tag_id);
create unique index if not exists guests_code_idx on public.guests (code);

-- حالة الباركود المحسوبة على الخادم (لا تعتمد على ساعة الجهاز إطلاقاً)
-- inactive: لم يحن وقت المناسبة | active: صالح | used: مُستخدم | expired: منتهي
create or replace function public.guest_code_state(g public.guests, e public.events)
returns text
language sql
stable
as $$
  select case
    when g.checked_in_at is not null then 'used'
    when e.status = 'archived' then 'expired'
    when now() > public.event_effective_end(e) + make_interval(mins => e.expiry_grace_minutes) then 'expired'
    when now() < e.starts_at - make_interval(mins => e.activation_lead_minutes) then 'inactive'
    when not e.is_paid and (
      select count(*) from public.guests g2
      where g2.event_id = e.id and g2.created_at <= g.created_at
    ) > e.free_quota then 'inactive'
    else 'active'
  end;
$$;

-- عرض جاهز يجمع المدعو بحالته المحسوبة
create or replace view public.guest_states as
  select
    g.*,
    public.guest_code_state(g, e) as code_state,
    e.owner_id,
    e.title as event_title
  from public.guests g
  join public.events e on e.id = g.event_id;

-- =============================================================
-- 5. حسابات مسؤولي الاستقبال (مصادقة مستقلة عن Supabase Auth)
-- =============================================================

create table if not exists public.scanner_accounts (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  username      text not null,
  display_name  text not null,
  password_hash text not null,
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  unique (username)
);

create index if not exists scanner_accounts_event_idx on public.scanner_accounts (event_id);

-- =============================================================
-- 6. سجل عمليات المسح
-- =============================================================

do $$ begin
  create type public.checkin_result as enum ('granted', 'duplicate', 'invalid', 'inactive', 'expired', 'override');
exception when duplicate_object then null; end $$;

create table if not exists public.checkins (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  guest_id     uuid references public.guests (id) on delete cascade,
  scanner_id   uuid references public.scanner_accounts (id) on delete set null,
  scanner_name text,                    -- نسخة ثابتة من اسم المسؤول للتتبع
  result       public.checkin_result not null,
  is_override  boolean not null default false,
  raw_code     text,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists checkins_event_idx on public.checkins (event_id, created_at desc);
create index if not exists checkins_guest_idx on public.checkins (guest_id);
create index if not exists checkins_override_idx on public.checkins (event_id) where is_override;

-- =============================================================
-- 7. التسليم للمدعوين (مُهيّأ لميزة واتساب/البريد التلقائية لاحقاً)
-- =============================================================

create table if not exists public.guest_deliveries (
  id           uuid primary key default gen_random_uuid(),
  guest_id     uuid not null references public.guests (id) on delete cascade,
  channel      text not null,            -- whatsapp | email | manual
  status       text not null default 'pending',  -- pending | sent | failed
  provider_ref text,
  error        text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists guest_deliveries_guest_idx on public.guest_deliveries (guest_id);

-- =============================================================
-- 8. الباقات والدفع
-- =============================================================

create table if not exists public.plans (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  description    text,
  price_halalas  integer not null default 0,     -- بالهللات (Moyasar)
  currency       text not null default 'SAR',
  billing_period text not null default 'one_time', -- one_time | monthly | yearly
  events_included integer,                        -- null = غير محدود
  guests_limit   integer,                         -- null = غير محدود
  features       jsonb not null default '[]'::jsonb,
  is_active      boolean not null default true,
  is_featured    boolean not null default false,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

alter table public.events
  drop constraint if exists events_plan_id_fkey;
alter table public.events
  add constraint events_plan_id_fkey
  foreign key (plan_id) references public.plans (id) on delete set null;

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  event_id            uuid references public.events (id) on delete set null,
  plan_id             uuid references public.plans (id) on delete set null,
  provider            text not null default 'moyasar',
  provider_payment_id text,
  amount_halalas      integer not null,
  currency            text not null default 'SAR',
  status              text not null default 'initiated', -- initiated | paid | failed | refunded
  raw                 jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
create unique index if not exists payments_provider_idx
  on public.payments (provider, provider_payment_id)
  where provider_payment_id is not null;

create table if not exists public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  plan_id            uuid not null references public.plans (id) on delete restrict,
  status             text not null default 'active', -- active | canceled | expired
  current_period_end timestamptz,
  provider_ref       text,
  created_at         timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id, status);

-- هل لدى المستخدم اشتراك فعّال يغطي مناسبات غير محدودة؟
create or replace function public.has_active_subscription(p_user uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user
      and s.status = 'active'
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- =============================================================
-- 9. نظام إدارة المحتوى (CMS) — كل نص/صورة قابلة للتعديل تُخزَّن كبيانات
-- =============================================================

create table if not exists public.site_content (
  key        text primary key,             -- مثال: home.hero.title
  page       text not null default 'home', -- home | about | pricing | gallery | common
  label      text,                         -- وصف يظهر للأدمن
  kind       text not null default 'text', -- text | richtext | image | list
  value      jsonb not null default '""'::jsonb,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create index if not exists site_content_page_idx on public.site_content (page, sort_order);

create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb not null,
  label      text,
  updated_at timestamptz not null default now()
);

-- =============================================================
-- 10. القوالب الجاهزة ومعرض الأعمال
-- =============================================================

create table if not exists public.template_categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  sort_order integer not null default 0
);

create table if not exists public.templates (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid references public.template_categories (id) on delete set null,
  name           text not null,
  background_url text not null,
  thumbnail_url  text,
  -- الإعدادات الافتراضية: موضع نص الاسم + الخط + اللون + إعدادات الباركود
  config         jsonb not null default '{}'::jsonb,
  is_active      boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists templates_category_idx on public.templates (category_id, sort_order);

alter table public.events
  drop constraint if exists events_template_id_fkey;
alter table public.events
  add constraint events_template_id_fkey
  foreign key (template_id) references public.templates (id) on delete set null;

create table if not exists public.gallery_items (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  image_url    text not null,
  event_type   text,
  is_published boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists gallery_published_idx on public.gallery_items (is_published, sort_order);

-- =============================================================
-- 11. سجلات الأخطاء والتدقيق (للأدمن)
-- =============================================================

create table if not exists public.error_logs (
  id         uuid primary key default gen_random_uuid(),
  level      text not null default 'error',  -- info | warn | error
  source     text not null,
  message    text not null,
  context    jsonb,
  user_id    uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists error_logs_created_idx on public.error_logs (created_at desc);

create table if not exists public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_type   text not null,     -- admin | organizer | scanner | system
  actor_id     uuid,
  actor_name   text,
  action       text not null,
  target_table text,
  target_id    uuid,
  meta         jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- =============================================================
-- 12. منطق المسح — دالة ذرّية تمنع التكرار حتى مع أجهزة متعددة
-- =============================================================

create or replace function public.process_scan(
  p_scanner_id uuid,
  p_code       text,
  p_override   boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scanner  public.scanner_accounts;
  v_event    public.events;
  v_guest    public.guests;
  v_tag      public.event_tags;
  v_state    text;
  v_result   public.checkin_result;
  v_uuid     uuid;
  v_attended integer;
  v_total    integer;
begin
  select * into v_scanner from public.scanner_accounts where id = p_scanner_id and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'result', 'invalid', 'message', 'حساب المسح غير صالح');
  end if;

  select * into v_event from public.events where id = v_scanner.event_id;

  -- الرمز داخل الـ QR هو UUID؛ أي شيء آخر مرفوض فوراً
  begin
    v_uuid := p_code::uuid;
  exception when others then
    insert into public.checkins (event_id, scanner_id, scanner_name, result, raw_code)
    values (v_event.id, v_scanner.id, v_scanner.display_name, 'invalid', left(p_code, 120));
    return jsonb_build_object('ok', false, 'result', 'invalid', 'message', 'باركود غير صالح');
  end;

  -- القفل يضمن أن محاولتين متزامنتين لا تنجحان معاً
  select * into v_guest
  from public.guests
  where code = v_uuid and event_id = v_event.id
  for update;

  if not found then
    insert into public.checkins (event_id, scanner_id, scanner_name, result, raw_code)
    values (v_event.id, v_scanner.id, v_scanner.display_name, 'invalid', left(p_code, 120));
    return jsonb_build_object('ok', false, 'result', 'invalid', 'message', 'هذا الباركود لا يخص هذه المناسبة');
  end if;

  select * into v_tag from public.event_tags where id = v_guest.tag_id;
  v_state := public.guest_code_state(v_guest, v_event);

  if v_state = 'used' and not p_override then
    insert into public.checkins (event_id, guest_id, scanner_id, scanner_name, result)
    values (v_event.id, v_guest.id, v_scanner.id, v_scanner.display_name, 'duplicate');
    v_result := 'duplicate';

  elsif v_state in ('inactive', 'expired') and not p_override then
    insert into public.checkins (event_id, guest_id, scanner_id, scanner_name, result)
    values (v_event.id, v_guest.id, v_scanner.id, v_scanner.display_name, v_state::public.checkin_result);
    v_result := v_state::public.checkin_result;

  else
    -- دخول ناجح (أو تجاوز يدوي مُسجَّل)
    update public.guests
    set checked_in_at = coalesce(checked_in_at, now()),
        checked_in_by = coalesce(checked_in_by, v_scanner.id),
        entries_count = entries_count + 1
    where id = v_guest.id
    returning * into v_guest;

    if p_override and v_state <> 'active' then
      v_result := 'override';
      insert into public.checkins (event_id, guest_id, scanner_id, scanner_name, result, is_override, note)
      values (v_event.id, v_guest.id, v_scanner.id, v_scanner.display_name, 'override', true,
              'تجاوز يدوي — الحالة قبل التجاوز: ' || v_state);
    else
      v_result := 'granted';
      insert into public.checkins (event_id, guest_id, scanner_id, scanner_name, result)
      values (v_event.id, v_guest.id, v_scanner.id, v_scanner.display_name, 'granted');
    end if;
  end if;

  select count(*) filter (where checked_in_at is not null), count(*)
  into v_attended, v_total
  from public.guests where event_id = v_event.id;

  return jsonb_build_object(
    'ok', v_result in ('granted', 'override'),
    'result', v_result,
    'state_before', v_state,
    'guest', jsonb_build_object(
      'id', v_guest.id,
      'name', v_guest.name,
      'seats', v_guest.seats,
      'checked_in_at', v_guest.checked_in_at,
      'entries_count', v_guest.entries_count,
      'tag', case when v_tag.id is null then null
             else jsonb_build_object('name', v_tag.name, 'color', v_tag.color) end
    ),
    'stats', jsonb_build_object('attended', v_attended, 'total', v_total)
  );
end;
$$;

revoke all on function public.process_scan(uuid, text, boolean) from public, anon, authenticated;

-- =============================================================
-- 13. إحصائيات التقرير
-- =============================================================

create or replace function public.event_report(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event  public.events;
  v_result jsonb;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    return null;
  end if;

  -- الوصول: صاحب المناسبة أو الأدمن فقط
  if auth.uid() is null or (v_event.owner_id <> auth.uid() and not public.is_super_admin()) then
    raise exception 'غير مصرح';
  end if;

  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_event.id,
      'title', v_event.title,
      'event_type', v_event.event_type,
      'starts_at', v_event.starts_at,
      'venue', v_event.venue
    ),
    'totals', (
      select jsonb_build_object(
        'invited', count(*),
        'attended', count(*) filter (where checked_in_at is not null),
        'absent', count(*) filter (where checked_in_at is null)
      ) from public.guests where event_id = p_event_id
    ),
    'by_tag', coalesce((
      select jsonb_agg(t)
      from (
        select
          coalesce(et.name, 'بدون فئة') as tag_name,
          coalesce(et.color, 'sand') as tag_color,
          count(g.*) as invited,
          count(g.*) filter (where g.checked_in_at is not null) as attended
        from public.guests g
        left join public.event_tags et on et.id = g.tag_id
        where g.event_id = p_event_id
        group by et.name, et.color, et.sort_order
        order by et.sort_order nulls last, count(g.*) desc
      ) t
    ), '[]'::jsonb),
    'overrides', (
      select count(*) from public.checkins
      where event_id = p_event_id and is_override
    )
  ) into v_result;

  return v_result;
end;
$$;

-- =============================================================
-- 14. سياسات الأمان على مستوى الصف (RLS)
-- =============================================================

alter table public.profiles          enable row level security;
alter table public.events            enable row level security;
alter table public.event_tags        enable row level security;
alter table public.guests            enable row level security;
alter table public.scanner_accounts  enable row level security;
alter table public.checkins          enable row level security;
alter table public.guest_deliveries  enable row level security;
alter table public.plans             enable row level security;
alter table public.payments          enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.site_content      enable row level security;
alter table public.site_settings     enable row level security;
alter table public.template_categories enable row level security;
alter table public.templates         enable row level security;
alter table public.gallery_items     enable row level security;
alter table public.error_logs        enable row level security;
alter table public.audit_logs        enable row level security;

-- ---------- profiles ----------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.is_super_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());

-- ---------- events ----------
drop policy if exists events_owner_all on public.events;
create policy events_owner_all on public.events
  for all using (owner_id = auth.uid() or public.is_super_admin())
  with check (owner_id = auth.uid() or public.is_super_admin());

-- دالة مساعدة: هل المستخدم الحالي يملك هذه المناسبة (أو أدمن)؟
create or replace function public.owns_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (e.owner_id = auth.uid() or public.is_super_admin())
  );
$$;

-- ---------- الجداول التابعة للمناسبة ----------
drop policy if exists event_tags_owner on public.event_tags;
create policy event_tags_owner on public.event_tags
  for all using (public.owns_event(event_id)) with check (public.owns_event(event_id));

drop policy if exists guests_owner on public.guests;
create policy guests_owner on public.guests
  for all using (public.owns_event(event_id)) with check (public.owns_event(event_id));

drop policy if exists scanner_accounts_owner on public.scanner_accounts;
create policy scanner_accounts_owner on public.scanner_accounts
  for all using (public.owns_event(event_id)) with check (public.owns_event(event_id));

drop policy if exists checkins_owner_read on public.checkins;
create policy checkins_owner_read on public.checkins
  for select using (public.owns_event(event_id));

drop policy if exists guest_deliveries_owner on public.guest_deliveries;
create policy guest_deliveries_owner on public.guest_deliveries
  for all using (
    exists (select 1 from public.guests g where g.id = guest_id and public.owns_event(g.event_id))
  ) with check (
    exists (select 1 from public.guests g where g.id = guest_id and public.owns_event(g.event_id))
  );

-- ---------- الدفع ----------
drop policy if exists payments_own on public.payments;
create policy payments_own on public.payments
  for select using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists subscriptions_own on public.subscriptions;
create policy subscriptions_own on public.subscriptions
  for select using (user_id = auth.uid() or public.is_super_admin());

-- ---------- المحتوى العام: قراءة للجميع، كتابة للأدمن ----------
drop policy if exists plans_public_read on public.plans;
create policy plans_public_read on public.plans
  for select using (is_active or public.is_super_admin());
drop policy if exists plans_admin_write on public.plans;
create policy plans_admin_write on public.plans
  for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists site_content_public_read on public.site_content;
create policy site_content_public_read on public.site_content for select using (true);
drop policy if exists site_content_admin_write on public.site_content;
create policy site_content_admin_write on public.site_content
  for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings for select using (true);
drop policy if exists site_settings_admin_write on public.site_settings;
create policy site_settings_admin_write on public.site_settings
  for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists template_categories_public_read on public.template_categories;
create policy template_categories_public_read on public.template_categories for select using (true);
drop policy if exists template_categories_admin_write on public.template_categories;
create policy template_categories_admin_write on public.template_categories
  for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists templates_public_read on public.templates;
create policy templates_public_read on public.templates
  for select using (is_active or public.is_super_admin());
drop policy if exists templates_admin_write on public.templates;
create policy templates_admin_write on public.templates
  for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists gallery_public_read on public.gallery_items;
create policy gallery_public_read on public.gallery_items
  for select using (is_published or public.is_super_admin());
drop policy if exists gallery_admin_write on public.gallery_items;
create policy gallery_admin_write on public.gallery_items
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------- السجلات: للأدمن فقط ----------
drop policy if exists error_logs_admin on public.error_logs;
create policy error_logs_admin on public.error_logs
  for select using (public.is_super_admin());

drop policy if exists audit_logs_admin on public.audit_logs;
create policy audit_logs_admin on public.audit_logs
  for select using (public.is_super_admin());

-- =============================================================
-- 15. مساحات التخزين (Storage)
-- =============================================================

insert into storage.buckets (id, name, public)
values
  ('designs',  'designs',  true),
  ('templates','templates',true),
  ('gallery',  'gallery',  true)
on conflict (id) do nothing;

drop policy if exists "public read buckets" on storage.objects;
create policy "public read buckets" on storage.objects
  for select using (bucket_id in ('designs', 'templates', 'gallery'));

-- المستخدم يرفع تصاميمه داخل مجلد باسم معرّفه فقط
drop policy if exists "users upload own designs" on storage.objects;
create policy "users upload own designs" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'designs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users manage own designs" on storage.objects;
create policy "users manage own designs" on storage.objects
  for update to authenticated
  using (bucket_id = 'designs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete own designs" on storage.objects;
create policy "users delete own designs" on storage.objects
  for delete to authenticated
  using (bucket_id = 'designs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "admin manages template assets" on storage.objects;
create policy "admin manages template assets" on storage.objects
  for all to authenticated
  using (bucket_id in ('templates', 'gallery') and public.is_super_admin())
  with check (bucket_id in ('templates', 'gallery') and public.is_super_admin());`,
  '0002_seed.sql': `-- =============================================================
-- بكجات — بيانات أولية (محتوى الموقع، الباقات، تصنيفات القوالب)
-- كل النصوص التسويقية تُخزَّن هنا كبيانات ليتمكن الأدمن من تعديلها
-- من لوحة التحكم بدون تعديل الكود.
-- =============================================================

-- ---------- إعدادات المنصة ----------
insert into public.site_settings (key, value, label) values
  ('free_guest_quota', '10'::jsonb, 'عدد الدعوات المجانية لكل مناسبة جديدة'),
  ('brand_name_ar', '"بكجات"'::jsonb, 'اسم المنصة بالعربي'),
  ('brand_name_en', '"PKGAT"'::jsonb, 'اسم المنصة بالإنجليزي'),
  ('support_email', '"hello@pkgat.com"'::jsonb, 'بريد الدعم'),
  ('support_whatsapp', '""'::jsonb, 'رقم واتساب الدعم')
on conflict (key) do nothing;

-- ---------- محتوى الصفحة الرئيسية ----------
insert into public.site_content (key, page, label, kind, value, sort_order) values
  ('home.hero.eyebrow', 'home', 'العنوان الصغير فوق العنوان الرئيسي', 'text',
   '"دعوات إلكترونية بباركود دخول"'::jsonb, 10),
  ('home.hero.title', 'home', 'العنوان الرئيسي', 'text',
   '"مناسبتك تبدأ من دعوة… وتنتهي بتقرير"'::jsonb, 20),
  ('home.hero.subtitle', 'home', 'النص التعريفي تحت العنوان', 'text',
   '"صمّم دعوتك، ولّد باركود فريد لكل مدعو، وتحكّم بالدخول من جوالك وقت المناسبة — بدون أي تطبيق."'::jsonb, 30),
  ('home.hero.primary_cta', 'home', 'زر الإجراء الأساسي', 'text', '"ابدأ مجاناً"'::jsonb, 40),
  ('home.hero.secondary_cta', 'home', 'زر الإجراء الثانوي', 'text', '"شوف أعمالنا"'::jsonb, 50),
  ('home.stats', 'home', 'أرقام سريعة (قائمة)', 'list',
   '[{"value":"٣ دقائق","label":"من التسجيل لأول دعوة"},
     {"value":"بدون تطبيق","label":"المسح من متصفح الجوال"},
     {"value":"باركود فريد","label":"لكل مدعو على حدة"}]'::jsonb, 60),
  ('home.features.title', 'home', 'عنوان قسم المميزات', 'text', '"كل اللي تحتاجه في مكان واحد"'::jsonb, 70),
  ('home.features.items', 'home', 'قائمة المميزات', 'list',
   '[{"icon":"palette","color":"grape","title":"تصميم على ذوقك","body":"اختر من قوالب جاهزة أو ارفع تصميمك الخاص وحدّد مكان اسم المدعو بالسحب والإفلات."},
     {"icon":"qr","color":"coral","title":"باركود فريد لكل مدعو","body":"معرّف عشوائي غير قابل للتخمين، بحجم ولون وخلفية تتحكم فيها بنفسك."},
     {"icon":"users","color":"mint","title":"إضافة مدعوين بثلاث طرق","body":"واحد واحد، أو لصق قائمة كاملة، أو استيراد ملف Excel/CSV — مع تصنيفهم بفئات."},
     {"icon":"scan","color":"sky","title":"مسح من الجوال مباشرة","body":"مسؤولو الاستقبال يفتحون رابط اللوحة من متصفح جوالهم — بدون تحميل أي تطبيق."},
     {"icon":"shield","color":"rose","title":"منع دخول مكرر","body":"الباركود يُستهلك بعد أول مسح. وفيه زر تجاوز مسجَّل للحالات الاستثنائية."},
     {"icon":"chart","color":"sunny","title":"تقرير بعد المناسبة","body":"نسبة الحضور الكاملة وتفصيل حسب الفئة، جاهز للطباعة أو الحفظ PDF."}]'::jsonb, 80),
  ('home.steps.title', 'home', 'عنوان قسم الخطوات', 'text', '"كيف تشتغل بكجات؟"'::jsonb, 90),
  ('home.steps.items', 'home', 'خطوات الاستخدام', 'list',
   '[{"title":"أنشئ مناسبتك","body":"اسم المناسبة، نوعها، التاريخ والموقع."},
     {"title":"صمّم الدعوة","body":"قالب جاهز أو تصميمك الخاص، وحدّد مكان الاسم والباركود."},
     {"title":"أضف المدعوين","body":"يدوي أو لصق قائمة أو استيراد ملف، مع تصنيفهم بفئات."},
     {"title":"وزّع وامسح","body":"حمّل الدعوات وأرسلها، وامسح الباركودات وقت المناسبة."}]'::jsonb, 100),
  ('home.cta.title', 'home', 'عنوان الدعوة النهائية', 'text', '"جرّب بكجات على أول ١٠ دعوات مجاناً"'::jsonb, 110),
  ('home.cta.body', 'home', 'نص الدعوة النهائية', 'text',
   '"سجّل، صمّم، وولّد دعواتك فعلياً قبل ما تدفع أي ريال."'::jsonb, 120)
on conflict (key) do nothing;

-- ---------- صفحة من نحن ----------
insert into public.site_content (key, page, label, kind, value, sort_order) values
  ('about.title', 'about', 'عنوان الصفحة', 'text', '"من نحن"'::jsonb, 10),
  ('about.lead', 'about', 'المقدمة', 'text',
   '"بكجات منصة سعودية تحوّل الدعوة الورقية إلى تجربة دخول منظّمة — من التصميم إلى باب القاعة."'::jsonb, 20),
  ('about.body', 'about', 'النص الأساسي', 'richtext',
   '"بدأت الفكرة من مشكلة بسيطة: كل مناسبة كبيرة تنتهي بفوضى على الباب — أسماء ما هي بالقائمة، ودعوات تنتشر بالواتساب، وما أحد يعرف كم واحد حضر فعلاً.\\n\\nبنينا بكجات عشان يكون لكل مدعو باركود يخصه وحده، ولكل مسؤول استقبال لوحة تشتغل من جواله مباشرة، ولصاحب المناسبة تقرير واضح بعد ما تنتهي.\\n\\nكل شيء من المتصفح — بدون تطبيقات، وبدون أجهزة خاصة."'::jsonb, 30),
  ('about.values', 'about', 'قيمنا (قائمة)', 'list',
   '[{"title":"البساطة","body":"من التسجيل لأول دعوة في دقائق، بواجهة عربية كاملة."},
     {"title":"الموثوقية","body":"منع التكرار على مستوى قاعدة البيانات، حتى لو تعددت الأجهزة والمداخل."},
     {"title":"الخصوصية","body":"بيانات مدعويك تخصك وحدك، ولا تُستخدم لأي غرض آخر."}]'::jsonb, 40)
on conflict (key) do nothing;

-- ---------- صفحة الأسعار ----------
insert into public.site_content (key, page, label, kind, value, sort_order) values
  ('pricing.title', 'pricing', 'عنوان الصفحة', 'text', '"باقات بسيطة وواضحة"'::jsonb, 10),
  ('pricing.subtitle', 'pricing', 'النص التعريفي', 'text',
   '"جرّب مجاناً على أول ١٠ دعوات في كل مناسبة، وادفع فقط لما تحتاج أكثر."'::jsonb, 20),
  ('pricing.note', 'pricing', 'ملاحظة أسفل الباقات', 'text',
   '"كل الأسعار شاملة ضريبة القيمة المضافة. الدفع عبر مدى وApple Pay والبطاقات الائتمانية."'::jsonb, 30),
  ('pricing.faq', 'pricing', 'الأسئلة الشائعة', 'list',
   '[{"q":"وش معنى الدعوات المجانية؟","a":"كل مناسبة جديدة تقدر تضيف فيها أول ١٠ مدعوين وتولّد دعواتهم فعلياً بدون دفع. الدفع يُطلب لما تحتاج تتجاوز هذا العدد."},
     {"q":"هل الباركود يشتغل بدون إنترنت؟","a":"لوحة المسح تحتاج اتصال إنترنت خفيف للتحقق الفوري ومنع التكرار، وهي مصممة لتعمل بسلاسة حتى مع شبكة ضعيفة."},
     {"q":"أقدر أضيف أكثر من مسؤول استقبال؟","a":"نعم، تقدر تنشئ حساب مسح مستقل لكل مدخل، وكل عملية مسح تُسجَّل باسم المسؤول اللي نفّذها."},
     {"q":"هل أقدر أسترجع مبلغ الاشتراك؟","a":"تواصل معنا خلال ٧ أيام من الدفع وقبل بدء المناسبة، ونراجع طلبك."}]'::jsonb, 40)
on conflict (key) do nothing;

-- ---------- صفحة معرض الأعمال ----------
insert into public.site_content (key, page, label, kind, value, sort_order) values
  ('gallery.title', 'gallery', 'عنوان الصفحة', 'text', '"أعمالنا"'::jsonb, 10),
  ('gallery.subtitle', 'gallery', 'النص التعريفي', 'text',
   '"نماذج من دعوات صُمّمت وأُنجزت فعلياً عبر بكجات."'::jsonb, 20)
on conflict (key) do nothing;

-- ---------- نصوص مشتركة ----------
insert into public.site_content (key, page, label, kind, value, sort_order) values
  ('common.footer_tagline', 'common', 'شعار التذييل', 'text',
   '"دعوات إلكترونية بباركود دخول — صُنع في السعودية."'::jsonb, 10),
  ('common.footer_note', 'common', 'ملاحظة التذييل', 'text',
   '"© بكجات. جميع الحقوق محفوظة."'::jsonb, 20)
on conflict (key) do nothing;

-- ---------- الباقات ----------
insert into public.plans (code, name, description, price_halalas, billing_period, events_included, guests_limit, features, is_featured, sort_order) values
  ('free', 'التجربة المجانية', 'جرّب التصميم وتوليد الدعوات قبل ما تدفع.', 0, 'one_time', 1, 10,
   '["١٠ دعوات لكل مناسبة","كل القوالب الجاهزة","تحميل الدعوات كصور","معاينة لوحة المسح"]'::jsonb, false, 10),

  ('event_basic', 'مناسبة واحدة', 'دفعة واحدة تغطي مناسبة كاملة بعدد مدعوين حتى ٢٠٠.', 19900, 'one_time', 1, 200,
   '["حتى ٢٠٠ مدعو","باركود فريد لكل مدعو","حسابات مسح متعددة","تقرير PDF بعد المناسبة","تحميل كل الدعوات ZIP"]'::jsonb, true, 20),

  ('event_plus', 'مناسبة كبيرة', 'للمناسبات الكبيرة بعدد مدعوين غير محدود.', 39900, 'one_time', 1, null,
   '["مدعوون غير محدودين","كل مميزات باقة المناسبة الواحدة","أولوية في الدعم"]'::jsonb, false, 30),

  ('pro_monthly', 'منظّم — شهري', 'لمنظمي المناسبات: مناسبات غير محدودة بالشهر.', 79900, 'monthly', null, null,
   '["مناسبات غير محدودة","مدعوون غير محدودين","حسابات مسح غير محدودة","تقارير كاملة","دعم مخصص"]'::jsonb, false, 40),

  ('pro_yearly', 'منظّم — سنوي', 'نفس الباقة الشهرية مع خصم سنتين شهرين مجاناً.', 799000, 'yearly', null, null,
   '["كل مميزات الباقة الشهرية","شهران مجاناً","فوترة سنوية واحدة"]'::jsonb, false, 50)
on conflict (code) do nothing;

-- ---------- تصنيفات القوالب ----------
insert into public.template_categories (slug, name, sort_order) values
  ('wedding', 'قوالب أعراس', 10),
  ('graduation', 'قوالب تخرج', 20),
  ('party', 'قوالب حفلات', 30),
  ('general', 'قوالب مناسبات عامة', 40)
on conflict (slug) do nothing;`,
  '0003_theme.sql': `-- =============================================================
-- بكجات — هوية الموقع اللونية قابلة للتعديل من لوحة الأدمن
-- =============================================================

insert into public.site_settings (key, value, label) values
  (
    'theme',
    '{"primary":"#6D4AFF","canvas":"#FFFDF9","sand":"#E7DAC3","ink":"#2A2521"}'::jsonb,
    'ألوان هوية الموقع'
  )
on conflict (key) do nothing;

-- نصوص إضافية في الصفحة الرئيسية صارت قابلة للتعديل
insert into public.site_content (key, page, label, kind, value, sort_order) values
  ('home.features.eyebrow', 'home', 'العنوان الصغير فوق قسم المميزات', 'text', '"المميزات"'::jsonb, 65),
  ('home.steps.eyebrow', 'home', 'العنوان الصغير فوق قسم الخطوات', 'text', '"كيف تشتغل"'::jsonb, 85),
  ('home.cta.primary', 'home', 'زر الدعوة النهائية الأساسي', 'text', '"أنشئ حسابك الآن"'::jsonb, 125),
  ('home.cta.secondary', 'home', 'زر الدعوة النهائية الثانوي', 'text', '"شوف الباقات"'::jsonb, 130)
on conflict (key) do nothing;`,
  '0004_activation.sql': `-- =============================================================
-- بكجات — نافذة تفعيل أقصر + تحكم يدوي بحالة الباركودات
-- =============================================================

-- التفعيل الافتراضي: ربع ساعة قبل المناسبة (كان ساعتين)
alter table public.events
  alter column activation_lead_minutes set default 15;

-- المناسبات القائمة التي لم يغيّر أصحابها القيمة تنتقل للافتراضي الجديد
update public.events
set activation_lead_minutes = 15
where activation_lead_minutes = 120;

-- تحكم يدوي يتجاوز التوقيت التلقائي:
--   auto   = حسب توقيت المناسبة (الافتراضي)
--   open   = مفعّلة الآن مهما كان الوقت
--   closed = موقوفة الآن مهما كان الوقت
alter table public.events
  add column if not exists activation_override text not null default 'auto';

do $$ begin
  alter table public.events
    add constraint events_activation_override_check
    check (activation_override in ('auto', 'open', 'closed'));
exception when duplicate_object then null; end $$;

-- =============================================================
-- حالة الباركود تحترم التجاوز اليدوي قبل أي حساب زمني
-- =============================================================

create or replace function public.guest_code_state(g public.guests, e public.events)
returns text
language sql
stable
as $$
  select case
    -- الاستخدام يسبق كل شيء: باركود مُستهلك يبقى مُستهلكاً
    when g.checked_in_at is not null then 'used'

    -- إيقاف يدوي من صاحب المناسبة
    when e.activation_override = 'closed' then 'expired'

    -- تفعيل يدوي: يتجاوز التوقيت لكنه يظل خاضعاً لحدّ الباقة المجانية
    when e.activation_override = 'open' then
      case
        when not e.is_paid and (
          select count(*) from public.guests g2
          where g2.event_id = e.id and g2.created_at <= g.created_at
        ) > e.free_quota then 'inactive'
        else 'active'
      end

    when e.status = 'archived' then 'expired'
    when now() > public.event_effective_end(e) + make_interval(mins => e.expiry_grace_minutes) then 'expired'
    when now() < e.starts_at - make_interval(mins => e.activation_lead_minutes) then 'inactive'
    when not e.is_paid and (
      select count(*) from public.guests g2
      where g2.event_id = e.id and g2.created_at <= g.created_at
    ) > e.free_quota then 'inactive'
    else 'active'
  end;
$$;`,
  '0005_end_event.sql': `-- =============================================================
-- بكجات — إنهاء المناسبة يوقف المسح فوراً + رسالة أوضح للباركود الغريب
-- =============================================================

-- المشكلة: زر «إنهاء المناسبة» يضبط status = 'ended' وended_manually_at،
-- لكن الدالة كانت تتحقق من 'archived' فقط، وتمرّر الإنهاء اليدوي عبر مهلة
-- الانتهاء (يوم كامل). فتظهر المناسبة «منتهية» في الواجهة بينما الباركودات
-- ما زالت تُقبل على الباب ٢٤ ساعة إضافية.
--
-- الإصلاح: الإنهاء — يدوياً أو بتغيير الحالة — يوقف المسح في اللحظة نفسها.
-- مهلة الانتهاء تبقى للنهاية التلقائية وحدها (تسامح مع المدعوين المتأخرين).

create or replace function public.guest_code_state(g public.guests, e public.events)
returns text
language sql
stable
as $$
  select case
    -- الاستخدام يسبق كل شيء: باركود مُستهلك يبقى مُستهلكاً
    when g.checked_in_at is not null then 'used'

    -- إيقاف يدوي صريح
    when e.activation_override = 'closed' then 'expired'

    -- تفعيل يدوي: يتجاوز كل ما دونه (بما فيه الإنهاء) عدا حدّ الباقة
    when e.activation_override = 'open' then
      case
        when not e.is_paid and (
          select count(*) from public.guests g2
          where g2.event_id = e.id and g2.created_at <= g.created_at
        ) > e.free_quota then 'inactive'
        else 'active'
      end

    -- المناسبة أُنهيت: لا مسح بعد ذلك مهما بقي من مهلة
    when e.status in ('ended', 'archived') then 'expired'
    when e.ended_manually_at is not null then 'expired'

    -- النهاية التلقائية وحدها هي التي تحصل على مهلة تسامح
    when now() > coalesce(e.ends_at, e.starts_at + interval '6 hours')
                 + make_interval(mins => e.expiry_grace_minutes) then 'expired'

    when now() < e.starts_at - make_interval(mins => e.activation_lead_minutes) then 'inactive'

    when not e.is_paid and (
      select count(*) from public.guests g2
      where g2.event_id = e.id and g2.created_at <= g.created_at
    ) > e.free_quota then 'inactive'

    else 'active'
  end;
$$;

-- =============================================================
-- المسح: تمييز باركود مناسبة أخرى عن باركود غير موجود إطلاقاً
-- =============================================================

create or replace function public.process_scan(
  p_scanner_id uuid,
  p_code       text,
  p_override   boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scanner  public.scanner_accounts;
  v_event    public.events;
  v_guest    public.guests;
  v_tag      public.event_tags;
  v_state    text;
  v_result   public.checkin_result;
  v_uuid     uuid;
  v_attended integer;
  v_total    integer;
  v_foreign  boolean;
begin
  select * into v_scanner from public.scanner_accounts where id = p_scanner_id and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'result', 'invalid', 'message', 'حساب المسح غير صالح');
  end if;

  select * into v_event from public.events where id = v_scanner.event_id;

  -- الرمز داخل الـ QR هو UUID؛ أي شيء آخر مرفوض فوراً
  begin
    v_uuid := p_code::uuid;
  exception when others then
    insert into public.checkins (event_id, scanner_id, scanner_name, result, raw_code)
    values (v_event.id, v_scanner.id, v_scanner.display_name, 'invalid', left(p_code, 120));
    return jsonb_build_object('ok', false, 'result', 'invalid', 'message', 'باركود غير صالح');
  end;

  -- القفل يضمن أن محاولتين متزامنتين لا تنجحان معاً
  select * into v_guest
  from public.guests
  where code = v_uuid and event_id = v_event.id
  for update;

  if not found then
    -- نميّز: هل الباركود يخص مناسبة أخرى أم لا وجود له أصلاً؟
    select exists (select 1 from public.guests where code = v_uuid) into v_foreign;

    insert into public.checkins (event_id, scanner_id, scanner_name, result, raw_code, note)
    values (
      v_event.id, v_scanner.id, v_scanner.display_name, 'invalid', left(p_code, 120),
      case when v_foreign then 'باركود يخص مناسبة أخرى' else 'باركود غير معروف' end
    );

    return jsonb_build_object(
      'ok', false,
      'result', 'invalid',
      'message', case
        when v_foreign then 'هذا الباركود يخص مناسبة أخرى — لا يُقبل هنا'
        else 'باركود غير معروف في المنصة'
      end
    );
  end if;

  select * into v_tag from public.event_tags where id = v_guest.tag_id;
  v_state := public.guest_code_state(v_guest, v_event);

  if v_state = 'used' and not p_override then
    insert into public.checkins (event_id, guest_id, scanner_id, scanner_name, result)
    values (v_event.id, v_guest.id, v_scanner.id, v_scanner.display_name, 'duplicate');
    v_result := 'duplicate';

  elsif v_state in ('inactive', 'expired') and not p_override then
    insert into public.checkins (event_id, guest_id, scanner_id, scanner_name, result)
    values (v_event.id, v_guest.id, v_scanner.id, v_scanner.display_name, v_state::public.checkin_result);
    v_result := v_state::public.checkin_result;

  else
    update public.guests
    set checked_in_at = coalesce(checked_in_at, now()),
        checked_in_by = coalesce(checked_in_by, v_scanner.id),
        entries_count = entries_count + 1
    where id = v_guest.id
    returning * into v_guest;

    if p_override and v_state <> 'active' then
      v_result := 'override';
      insert into public.checkins (event_id, guest_id, scanner_id, scanner_name, result, is_override, note)
      values (v_event.id, v_guest.id, v_scanner.id, v_scanner.display_name, 'override', true,
              'تجاوز يدوي — الحالة قبل التجاوز: ' || v_state);
    else
      v_result := 'granted';
      insert into public.checkins (event_id, guest_id, scanner_id, scanner_name, result)
      values (v_event.id, v_guest.id, v_scanner.id, v_scanner.display_name, 'granted');
    end if;
  end if;

  select count(*) filter (where checked_in_at is not null), count(*)
  into v_attended, v_total
  from public.guests where event_id = v_event.id;

  return jsonb_build_object(
    'ok', v_result in ('granted', 'override'),
    'result', v_result,
    'state_before', v_state,
    'guest', jsonb_build_object(
      'id', v_guest.id,
      'name', v_guest.name,
      'seats', v_guest.seats,
      'checked_in_at', v_guest.checked_in_at,
      'entries_count', v_guest.entries_count,
      'tag', case when v_tag.id is null then null
             else jsonb_build_object('name', v_tag.name, 'color', v_tag.color) end
    ),
    'stats', jsonb_build_object('attended', v_attended, 'total', v_total)
  );
end;
$$;

revoke all on function public.process_scan(uuid, text, boolean) from public, anon, authenticated;`,
  '0006_legal_and_content.sql': `-- =============================================================
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
where not exists (select 1 from public.gallery_items g where g.title = t.title);`,
  '0007_phone_and_grants.sql': `-- =============================================================
-- 0007 — رقم الجوال الإلزامي ومنح الأدمن
--
-- ١. رقم الجوال صار إلزامياً عند التسجيل، فيُمرَّر ضمن بيانات المستخدم
--    ويثبّته المُشغّل في جدول الملفات مباشرة — بدل ما يُترك فارغاً
--    ويُملأ لاحقاً من لوحة الأدمن يدوياً.
-- ٢. عمود free_quota_override: يسمح للأدمن بمنح مستخدم بعينه عدد دعوات
--    مجانية يختلف عن الإعداد العام.
-- =============================================================

-- -------------------------------------------------------------
-- ١. حصة دعوات خاصة بمستخدم
-- -------------------------------------------------------------
alter table public.profiles
  add column if not exists free_quota_override integer;

comment on column public.profiles.free_quota_override is
  'حصة دعوات مجانية خاصة بهذا المستخدم — null يعني استخدام الإعداد العام free_guest_quota';

-- -------------------------------------------------------------
-- ٢. المُشغّل يحفظ الجوال والموافقات معاً وقت التسجيل
-- -------------------------------------------------------------
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
  v_phone text := nullif(trim(new.raw_user_meta_data ->> 'phone'), '');
begin
  insert into public.profiles (
    id, email, full_name, phone,
    terms_accepted_at, marketing_consent, marketing_consent_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    v_phone,
    -- قبول الشروط شرط لإتمام التسجيل، فوقت الإنشاء هو وقت القبول
    now(),
    v_marketing,
    case when v_marketing then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;`,
  '0008_demo_and_reminders.sql': `-- =============================================================
-- 0008 — المناسبة التجريبية وتذكير ما قبل المناسبة
--
-- ١. demo_seeded: علامة على الملف تمنع إعادة زرع المناسبة التجريبية
--    كلما فتح المستخدم لوحته — لو حذفها فهو قرار منه، لا خطأ نصلحه له.
-- ٢. reminder_sent_at: تمنع تكرار تذكير المناسبة الواحدة، لأن مهمة
--    التذكير تعمل كل ساعة والنافذة الزمنية تغطي أكثر من تشغيل واحد.
-- ٣. is_demo: تمييز المناسبة التجريبية حتى لا تُحسب في الإحصاءات ولا
--    يُرسل لها تذكير.
-- =============================================================

alter table public.profiles
  add column if not exists demo_seeded boolean not null default false;

comment on column public.profiles.demo_seeded is
  'زُرعت المناسبة التجريبية لهذا المستخدم — لا تُزرع مرة أخرى';

alter table public.events
  add column if not exists is_demo          boolean not null default false,
  add column if not exists reminder_sent_at timestamptz;

comment on column public.events.is_demo is
  'مناسبة تجريبية مزروعة تلقائياً للتعرّف على المنصة';
comment on column public.events.reminder_sent_at is
  'وقت إرسال تذكير ما قبل المناسبة — يمنع التكرار';

create index if not exists events_reminder_idx
  on public.events (starts_at)
  where reminder_sent_at is null and not is_demo;

-- الحسابات القائمة لا تحتاج مناسبة تجريبية بأثر رجعي: من أنشأ مناسبة
-- فعلية تجاوز مرحلة التعرّف أصلاً
update public.profiles p
   set demo_seeded = true
 where exists (select 1 from public.events e where e.owner_id = p.id);`,
  '0009_guest_limit.sql': `-- =============================================================
-- 0009 — حدّ المدعوين يحترم العضوية والباقة المدفوعة
--
-- الخلل: guest_code_state كانت تعرف شيئاً واحداً فقط عن الحدود —
-- e.free_quota — ولا تعرف شيئاً عن الاشتراكات إطلاقاً. بينما الواجهة
-- (getGuestLimit في TypeScript) تحسب الحد الحقيقي: اشتراك فعّال ⇒ بلا
-- حد، ثم باقة المناسبة المدفوعة، ثم الحصة المجانية.
--
-- النتيجة: من يُمنح عضوية تسمح له الواجهة بإضافة مدعوين بلا حد، بينما
-- قاعدة البيانات تُخرج كل باركود بعد free_quota بحالة 'inactive' فلا
-- يُمسح على الباب. المصدران كانا يختلفان، والباب يتبع قاعدة البيانات.
--
-- الإصلاح: دالة واحدة تحسب تجاوز الحد، تحترم نفس ترتيب أولويات
-- الواجهة، وتُستدعى من guest_code_state في الموضعين.
-- =============================================================

-- احتياطاً لو لم يُنفَّذ 0007 بعد — العمود مطلوب في حساب الحصة
alter table public.profiles
  add column if not exists free_quota_override integer;

/**
 * هل تجاوز هذا المدعو حدّ المناسبة؟
 *
 * الترتيب مطابق لـ getGuestLimit في التطبيق:
 *   اشتراك فعّال للمالك ⇒ بلا حد
 *   مناسبة مدفوعة       ⇒ حدّ الباقة (null فيها = بلا حد)
 *   غير ذلك             ⇒ الحصة المجانية المحفوظة في المناسبة
 *
 * security definer لأن سياسة الاشتراكات تسمح لصاحبها فقط بقراءتها،
 * والعرض guest_states يُستعلم بهوية المستخدم — فبدونها يبدو المالك
 * بلا اشتراك ويعود الخلل نفسه.
 */
create or replace function public.guest_over_limit(g public.guests, e public.events)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.subscriptions s
      where s.user_id = e.owner_id
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
    ) then false

    when e.is_paid then coalesce(
      (
        select count(*) from public.guests g2
        where g2.event_id = e.id and g2.created_at <= g.created_at
      ) > (select p.guests_limit from public.plans p where p.id = e.plan_id),
      false  -- باقة بلا حد (guests_limit = null) أو بلا باقة ⇒ بلا حد
    )

    else (
      select count(*) from public.guests g2
      where g2.event_id = e.id and g2.created_at <= g.created_at
    ) > e.free_quota
  end;
$$;

-- =============================================================
-- حالة الباركود — نفس منطق 0005 مع استبدال فحص الحصة بالدالة أعلاه
-- =============================================================
create or replace function public.guest_code_state(g public.guests, e public.events)
returns text
language sql
stable
as $$
  select case
    -- الاستخدام يسبق كل شيء: باركود مُستهلك يبقى مُستهلكاً
    when g.checked_in_at is not null then 'used'

    -- إيقاف يدوي صريح
    when e.activation_override = 'closed' then 'expired'

    -- تفعيل يدوي: يتجاوز التوقيت وحده — الحد يبقى مطبَّقاً
    when e.activation_override = 'open' then
      case
        when public.guest_over_limit(g, e) then 'inactive'
        else 'active'
      end

    -- المناسبة أُنهيت: لا مسح بعد ذلك مهما بقي من مهلة
    when e.status in ('ended', 'archived') then 'expired'
    when e.ended_manually_at is not null then 'expired'

    -- النهاية التلقائية وحدها هي التي تحصل على مهلة تسامح
    when now() > coalesce(e.ends_at, e.starts_at + interval '6 hours')
                 + make_interval(mins => e.expiry_grace_minutes) then 'expired'

    when now() < e.starts_at - make_interval(mins => e.activation_lead_minutes) then 'inactive'

    when public.guest_over_limit(g, e) then 'inactive'

    else 'active'
  end;
$$;`,
  '0010_suggestions_and_showcase.sql': `-- =============================================================
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
exception when undefined_object then null; end $$;`,
  '0011_public_suggestions_unique_phone.sql': `-- =============================================================
-- 0011 — اقتراحات مفتوحة للجميع + منع تكرار رقم الجوال
--
-- ١. الاقتراحات كانت للمسجّلين فقط. صاحب المنصة يريدها مفتوحة لأي زائر،
--    لأن أنفع الملاحظات تأتي ممن جرّب الموقع ولم يُكمل التسجيل.
-- ٢. رقم الجوال كان يتكرر بين حسابات — وهو معرّف تواصل أساسي، وتكراره
--    يعني حسابين لا يمكن تمييزهما عند الدعم أو استرجاع الحساب.
-- =============================================================

-- -------------------------------------------------------------
-- ١. فتح الاقتراحات للزائر
-- -------------------------------------------------------------
alter table public.suggestions
  alter column user_id drop not null;

drop policy if exists suggestions_insert on public.suggestions;
create policy suggestions_insert on public.suggestions
  for insert with check (true);

-- -------------------------------------------------------------
-- ٢. رقم جوال فريد لكل حساب
--
-- فهرس جزئي: الفراغ لا يتعارض مع الفراغ، فالحسابات القديمة التي سجّلت
-- قبل إلزام الجوال تبقى صالحة.
-- -------------------------------------------------------------
do $$
declare
  v_dupes integer;
begin
  select count(*) into v_dupes from (
    select phone from public.profiles
    where phone is not null and phone <> ''
    group by phone having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise notice 'تنبيه: % رقم جوال مكرر في الحسابات القائمة — لم يُنشأ الفهرس. نظّفها ثم أعد تنفيذ هذا الملف.', v_dupes;
  else
    create unique index if not exists profiles_phone_unique
      on public.profiles (phone)
      where phone is not null and phone <> '';
    raise notice 'تم إنشاء فهرس تفرّد رقم الجوال.';
  end if;
end $$;

-- دالة يستدعيها التسجيل للتحقق قبل إنشاء الحساب، فيرى المستخدم رسالة
-- عربية واضحة بدل خطأ قاعدة بيانات غامض من مُشغّل إنشاء الملف.
create or replace function public.is_phone_taken(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where phone = p_phone and p_phone is not null and p_phone <> ''
  );
$$;

do $$ begin
  grant execute on function public.is_phone_taken(text) to anon, authenticated;
exception when undefined_object then null; end $$;`,
  '0012_custom_fonts.sql': `-- =============================================================
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
  with check (bucket_id = 'fonts' and public.is_super_admin());`,
  '0013_showcase_excludes_demo.sql': `-- =============================================================
-- 0013 — المناسبة التجريبية تخرج من معرض تصاميم العملاء
--
-- الخلل: عرض shared_designs يجمع كل مناسبة عليها shared_design ولها
-- خلفية — بما فيها «المناسبة التجريبية» التي تُنشأ تلقائياً لكل حساب
-- جديد. فيظهر في قسم «دعوات صمّمها عملاؤنا» عنصر تجريبي واحد بدل
-- تصاميم حقيقية، والعنوان يَعِد بما لا يفي به.
--
-- المناسبة التجريبية ليست عمل عميل، فلا مكان لها في معرض أعماله.
-- =============================================================

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
    and not e.is_demo
  order by e.shared_at desc nulls last;

do $$ begin
  grant select on public.shared_designs to anon, authenticated;
exception when undefined_object then null; end $$;`,
  '0014_social_proof_and_links.sql': `-- =============================================================
-- 0014 — إثبات اجتماعي وروابط التواصل
--
-- أرقام الإثبات الاجتماعي وروابط الحسابات تُدار من لوحة الأدمن لا من
-- الكود: صاحب المنصة يحدّثها من جواله متى تغيّرت، بلا نشر جديد.
--
-- القيم الافتراضية صفر/فارغة عمداً — والواجهة تُخفي ما لم يُضبط. رقم
-- غير حقيقي في مكان «إثبات» أسوأ من غيابه.
-- =============================================================

insert into public.site_settings (key, value, label) values
  ('social_proof_events', '0'::jsonb,
   'عدد المناسبات المنظَّمة (٠ = يُخفى من الموقع)'),
  ('social_proof_guests', '0'::jsonb,
   'عدد المدعوين الذين دخلوا بباركود (٠ = يُخفى)'),
  ('social_proof_rating', '0'::jsonb,
   'متوسط التقييم من ٥ — مثال 4.8 (٠ = يُخفى)'),
  ('social_proof_rating_count', '0'::jsonb,
   'عدد من قيّموا المنصة (٠ = يُخفى)'),
  ('instagram_url', '""'::jsonb,
   'رابط حساب انستقرام (فارغ = يُخفى)'),
  ('x_url', '""'::jsonb,
   'رابط حساب X/تويتر (فارغ = يُخفى)')
on conflict (key) do nothing;`,
  '0015_home_faq_and_free_stat.sql': `-- =============================================================
-- 0015 — نصوص جديدة في الصفحة الرئيسية تُدار من لوحة الأدمن
--
-- بطاقة «١٠ دعوات» وأسئلة الرئيسية تعمل بقيم احتياطية في الكود، فلا
-- يتوقف عليها شيء. هذا الترحيل يجعلها قابلة للتعديل من لوحة الأدمن
-- كبقية نصوص الموقع.
--
-- أجوبة الأسئلة هنا نصّها نصّ صفحة الأسعار حرفياً — سؤال واحد بجوابين
-- مختلفين أسوأ من عدم عرضه.
-- =============================================================

insert into public.site_content (key, page, label, kind, value, sort_order) values
  ('home.stats.free_value', 'home', 'بطاقة البطل الرابعة — الرقم', 'text',
   '"١٠ دعوات"'::jsonb, 55),
  ('home.stats.free_label', 'home', 'بطاقة البطل الرابعة — الوصف', 'text',
   '"مجاناً في كل مناسبة"'::jsonb, 56),

  ('home.faq.eyebrow', 'home', 'الأسئلة الشائعة — العنوان الصغير', 'text',
   '"أسئلة شائعة"'::jsonb, 101),
  ('home.faq.title', 'home', 'الأسئلة الشائعة — العنوان', 'text',
   '"أكثر ما يُسأل عنه"'::jsonb, 102),
  ('home.faq', 'home', 'الأسئلة الشائعة في الرئيسية', 'list',
   '[{"q":"هل الباركود يشتغل بدون إنترنت؟","a":"لوحة المسح تحتاج اتصال إنترنت خفيف للتحقق الفوري ومنع التكرار، وهي مصممة لتعمل بسلاسة حتى مع شبكة ضعيفة."},
     {"q":"وش معنى الدعوات المجانية؟","a":"كل مناسبة جديدة تقدر تضيف فيها أول ١٠ مدعوين وتولّد دعواتهم فعلياً بدون دفع. الدفع يُطلب لما تحتاج تتجاوز هذا العدد."},
     {"q":"أقدر أضيف أكثر من مسؤول استقبال؟","a":"نعم، تقدر تنشئ حساب مسح مستقل لكل مدخل، وكل عملية مسح تُسجَّل باسم المسؤول اللي نفّذها."},
     {"q":"هل المدعو يحتاج يحمّل تطبيق؟","a":"لا. المدعو يستلم دعوته كصورة، ومسؤول الاستقبال يمسح الباركود من متصفح جواله مباشرة — بدون أي تطبيق على الطرفين."}]'::jsonb, 103)
on conflict (key) do nothing;`,
  '0016_showcase_full_design.sql': `-- =============================================================
-- 0016 — المعرض يعرض الدعوة كاملة لا خلفيتها وحدها
--
-- الخلل: العرض كان يكشف backgroundUrl فقط، فتظهر في المعرض صورة
-- خلفية بلا اسم المناسبة ولا تاريخها ولا مكانها ولا أي نص كتبه صاحبها.
-- والعميل حين يشارك عمله إنما يشارك الدعوة التي صمّمها بكل تفاصيلها،
-- لا الورقة التي بنى عليها.
--
-- الحل: كشف كائن التصميم كاملاً، فترسمه الواجهة بنفس الدالة التي
-- تولّد الدعوات الحقيقية — فيظهر ما صنعه العميل كما هو تماماً.
--
-- الخصوصية: التصميم يحوي النصوص التي كتبها صاحب المناسبة والاسم
-- التجريبي في المحرّر — ولا يحوي أي بيان عن مدعوّ حقيقي. والعرض لا
-- يشمل إلا من فعّل المشاركة بنفسه.
-- =============================================================

create or replace view public.shared_designs
with (security_invoker = false) as
  select
    e.id,
    e.title,
    e.event_type,
    e.design ->> 'backgroundUrl' as background_url,
    e.shared_at,
    -- يُضاف في آخر القائمة عمداً: create or replace view لا يقبل إدراج
    -- عمود بين الأعمدة القائمة، بل الإلحاق في آخرها فقط
    e.design as design
  from public.events e
  where e.shared_design
    and e.design ->> 'backgroundUrl' is not null
    and not e.is_demo
  order by e.shared_at desc nulls last;

do $$ begin
  grant select on public.shared_designs to anon, authenticated;
exception when undefined_object then null; end $$;`,
  '0017_support_contact_defaults.sql': `-- =============================================================
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
 where key = 'x_url';`,
  '0018_privilege_and_billing_guards.sql': `-- =============================================================
-- 0018 — سدّ ثغرتين خطيرتين في الصلاحيات والحدود
--
-- سياستا profiles_update_own و events_owner_all تسمحان لصاحب الصف
-- بتعديل صفّه كاملاً. وسياسات RLS في PostgreSQL تعمل على مستوى الصف لا
-- العمود، فلا تفرّق بين تعديل الاسم وتعديل صلاحية الأدمن.
--
-- والنتيجة أن أي مستخدم مسجّل يستطيع — من متصفحه وبمفتاح anon المنشور
-- في الصفحة أصلاً — أن:
--
--   ١. يجعل نفسه أدمن:  update profiles set is_super_admin = true
--      فيرى كل الحسابات وكل المناسبات ويتحكم بالمنصة كاملة.
--   ٢. يرفع حصته:       update events set free_quota = 99999
--      أو يعلن مناسبته مدفوعة، فتعمل باركوداته كلها بلا دفع.
--   ٣. يفكّ إيقاف حسابه: update profiles set is_suspended = false
--
-- كلاهما مُثبَت عملياً على قاعدة بيانات حقيقية بدور authenticated.
--
-- الإصلاح: حارسان قبل الكتابة يمنعان تعديل الحقول الحسّاسة حين يأتي
-- الطلب من المتصفح (دورا anon و authenticated)، ويمرّران ما يأتي بمفتاح
-- الخدمة — وهو وحده ما تستعمله مسارات الأدمن وتفعيل الدفع.
--
-- الحدّ المجاني يُحسب في الخادم عند الإنشاء ولا يُستقبل من المتصفح
-- إطلاقاً، فلا يبقى للقيمة القادمة من العميل أثر.
-- =============================================================

-- -------------------------------------------------------------
-- ١. صلاحيات الحساب وحصته
-- -------------------------------------------------------------
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
-- لا security definer عمداً: هي تبدّل current_user لمالك الدالة، فيصير
-- الحارس أعمى عن هوية المنفّذ ويمرّر كل شيء. بصلاحية المنادي يبقى
-- current_user هو الدور الحقيقي (authenticated أو service_role).
security invoker
set search_path = public
as $$
begin
  -- مسارات الأدمن تمرّ بمفتاح الخدمة (service_role)، وهي وحدها المخوّلة
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.is_super_admin      is distinct from old.is_super_admin
  or new.is_suspended        is distinct from old.is_suspended
  or new.free_quota_override is distinct from old.free_quota_override
  or new.id                  is distinct from old.id then
    raise exception 'لا يجوز تعديل صلاحيات الحساب أو حصته من المتصفح'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_privilege_guard on public.profiles;
create trigger profiles_privilege_guard
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- -------------------------------------------------------------
-- ٢. بيانات الدفع والحصة في المناسبة
-- -------------------------------------------------------------
create or replace function public.guard_event_billing()
returns trigger
language plpgsql
-- لا security definer عمداً: هي تبدّل current_user لمالك الدالة، فيصير
-- الحارس أعمى عن هوية المنفّذ ويمرّر كل شيء. بصلاحية المنادي يبقى
-- current_user هو الدور الحقيقي (authenticated أو service_role).
security invoker
set search_path = public
as $$
declare
  v_quota integer;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- الحصة تُشتق من الحصة الممنوحة للحساب، وإلا فمن إعداد المنصة.
    -- ما يرسله المتصفح يُهمَل تماماً.
    select coalesce(
             (select p.free_quota_override
                from public.profiles p
               where p.id = new.owner_id),
             (select nullif(s.value #>> '{}', '')::integer
                from public.site_settings s
               where s.key = 'free_guest_quota'),
             10
           )
      into v_quota;

    new.free_quota := greatest(coalesce(v_quota, 10), 0);
    new.is_paid    := false;
    new.paid_at    := null;
    new.plan_id    := null;
    new.is_demo    := false;
    return new;
  end if;

  if new.is_paid    is distinct from old.is_paid
  or new.plan_id    is distinct from old.plan_id
  or new.paid_at    is distinct from old.paid_at
  or new.free_quota is distinct from old.free_quota
  or new.owner_id   is distinct from old.owner_id
  or new.is_demo    is distinct from old.is_demo then
    raise exception 'لا يجوز تعديل بيانات الدفع أو الحصة من المتصفح'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists events_billing_guard on public.events;
create trigger events_billing_guard
  before insert or update on public.events
  for each row execute function public.guard_event_billing();

-- -------------------------------------------------------------
-- ٣. طريقة للتأكد أن الحارسين مركّبان فعلاً
--
-- صفحة فحص قاعدة البيانات تقرأ بمفتاح الخدمة، وهو يتجاوز الحارس
-- بطبيعته — فلا تستطيع اختباره بمحاولة اختراق. وغياب هذه الدالة نفسه
-- دليل على أن الترحيل لم يُنفَّذ.
-- -------------------------------------------------------------
create or replace function public.security_guards_installed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
      select 1 from pg_trigger
       where tgname = 'profiles_privilege_guard' and not tgisinternal
    ) and exists (
      select 1 from pg_trigger
       where tgname = 'events_billing_guard' and not tgisinternal
    );
$$;

do $$ begin
  grant execute on function public.security_guards_installed() to anon, authenticated;
exception when undefined_object then null; end $$;`,
  '0019_account_wide_free_quota.sql': `-- =============================================================
-- 0019 — الحصة المجانية تُحسب على الحساب كله لا على كل مناسبة
--
-- كانت الحصة لكل مناسبة: من ينشئ خمس مناسبات يحصل على خمسين دعوة
-- مجاناً. صاحب المنصة يريدها تجربة واحدة: عشر دعوات للحساب، ثم الدفع.
--
-- النطاق إعداد لا ثابت (free_quota_scope): تغيير قيمته وحده يعيد
-- السلوك القديم بلا ترحيل جديد ولا نشر.
--
--   per_account  ⇒ عشر دعوات للحساب كله (الافتراضي)
--   per_event    ⇒ عشر دعوات لكل مناسبة (السلوك القديم)
--
-- المناسبة التجريبية خارج الحساب في الحالتين: هي للتعرّف على المنصة،
-- ولو خصمت من الحصة لاستهلكها المستخدم قبل أن يبدأ.
-- =============================================================

insert into public.site_settings (key, value, label) values
  ('free_quota_scope', '"per_account"'::jsonb,
   'نطاق الحصة المجانية: per_account (للحساب كله) أو per_event (لكل مناسبة)')
on conflict (key) do nothing;

/**
 * هل تجاوز هذا المدعو الحدّ؟
 *
 * الترتيب كما هو: اشتراك فعّال ⇒ بلا حد، ثم باقة المناسبة المدفوعة،
 * ثم الحصة المجانية — والجديد أن الحصة المجانية قد تُحسب على الحساب.
 */
create or replace function public.guest_over_limit(g public.guests, e public.events)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- المناسبة التجريبية لا تُحاسَب أبداً: هي باب التعرّف على المنصة
    when coalesce(e.is_demo, false) then false

    when exists (
      select 1 from public.subscriptions s
      where s.user_id = e.owner_id
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
    ) then false

    when e.is_paid then coalesce(
      (
        select count(*) from public.guests g2
        where g2.event_id = e.id and g2.created_at <= g.created_at
      ) > (select p.guests_limit from public.plans p where p.id = e.plan_id),
      false  -- باقة بلا حد (guests_limit = null) أو بلا باقة ⇒ بلا حد
    )

    -- الحصة المجانية على مستوى الحساب: كل مدعوّي المناسبات غير المدفوعة
    when coalesce(
           (select s.value #>> '{}' from public.site_settings s
             where s.key = 'free_quota_scope'),
           'per_account'
         ) = 'per_account'
    then (
      select count(*)
        from public.guests g2
        join public.events e2 on e2.id = g2.event_id
       where e2.owner_id = e.owner_id
         and not e2.is_paid
         and not coalesce(e2.is_demo, false)
         and g2.created_at <= g.created_at
    ) > coalesce(
          (select p.free_quota_override from public.profiles p where p.id = e.owner_id),
          (select nullif(s.value #>> '{}', '')::integer from public.site_settings s
            where s.key = 'free_guest_quota'),
          10
        )

    -- النطاق القديم: لكل مناسبة على حدة
    else (
      select count(*) from public.guests g2
      where g2.event_id = e.id and g2.created_at <= g.created_at
    ) > e.free_quota
  end;
$$;`,
  '0020_free_quota_copy.sql': `-- =============================================================
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
   and jsonb_typeof(value) = 'array';`,
  '0021_free_trial_ledger.sql': `-- =============================================================
-- 0021 — التجربة المجانية دفتر لا عدّاد: الحذف لا يُرجع الحصة
--
-- الخلل: 0019 كان يحسب المستهلك بعدّ صفوف المدعوين الموجودة الآن.
-- وحذف المناسبة يحذف مدعويها معها (on delete cascade)، فيرجع العدّ
-- صفراً وترجع العشر دعوات كاملة — بلا حد ولا نهاية:
--
--   أنشئ مناسبة ← أضف عشرة ← احذف المناسبة ← أعد الكرّة
--
-- وحتى حذف المدعوين واحداً واحداً داخل المناسبة كان يُرجع الحصة، فأي
-- سدٍّ يقتصر على حذف المناسبة يُلتفّ عليه بحذف المدعوين قبلها.
-- «تجربة مجانية مرة واحدة» صارت مجانية إلى الأبد لمن يحذف ويعيد.
--
-- الإصلاح: دفتر لا يُمحى. كل مدعو يُضاف في مناسبة غير مدفوعة وغير
-- تجريبية يسحب رقماً متسلسلاً من رصيد الحساب:
--
--   profiles.free_guests_used  ← الرصيد المستهلك، في الحساب لا في المناسبة
--   guests.free_seq            ← رقم هذا المدعو في الدفتر، مختوم عند الإضافة
--
-- ولأن الرقم يُسحب من الحساب، حذف المدعو أو مناسبته كاملة لا يعيده.
-- ولأنه مختوم في الصف، حالة الباركود تُحسب بقراءة واحدة لا بعدّ يتغيّر
-- تحتها.
--
-- المناسبة التجريبية تبقى خارج الدفتر كما كانت: هي باب التعرّف على
-- المنصة، ولو خصمت من الحصة لاستهلكها المستخدم قبل أن يبدأ.
--
-- والمناسبة المدفوعة كذلك: مدعووها يُحاسَبون بحدّ باقتها لا بالدفتر.
-- =============================================================

-- -------------------------------------------------------------
-- ١. عمودا الدفتر
-- -------------------------------------------------------------
alter table public.profiles
  add column if not exists free_guests_used integer not null default 0;

comment on column public.profiles.free_guests_used is
  'مجموع ما استهلكه الحساب من الدعوات المجانية طوال عمره. لا ينقص بحذف مناسبة أو مدعو.';

alter table public.guests
  add column if not exists free_seq integer;

comment on column public.guests.free_seq is
  'رقم هذا المدعو في دفتر الحساب المجاني لحظة إضافته. فارغ في المناسبات المدفوعة والتجريبية.';

-- -------------------------------------------------------------
-- ٢. الحصة الممنوحة للحساب — كانت مكرّرة في ثلاثة مواضع
-- -------------------------------------------------------------
create or replace function public.account_free_allowance(p_owner uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.free_quota_override from public.profiles p where p.id = p_owner),
    (select nullif(s.value #>> '{}', '')::integer from public.site_settings s
      where s.key = 'free_guest_quota'),
    10
  );
$$;

-- -------------------------------------------------------------
-- ٣. ترحيل ما هو قائم إلى الدفتر
--
-- يُرقّم المدعوين الحاليين بترتيب إضافتهم لكل حساب، ثم يرفع رصيد
-- الحساب. \`greatest\` تجعل إعادة تنفيذ الترحيل بلا ضرر: لا تُنقص رصيداً
-- استُهلك بعد أول تنفيذ.
-- -------------------------------------------------------------
with ordered as (
  select g.id,
         row_number() over (
           partition by e.owner_id
           order by g.created_at, g.id
         ) as seq
    from public.guests g
    join public.events e on e.id = g.event_id
   where not e.is_paid
     and not coalesce(e.is_demo, false)
)
update public.guests g
   set free_seq = o.seq
  from ordered o
 where o.id = g.id
   and g.free_seq is null;

update public.profiles p
   set free_guests_used = greatest(coalesce(p.free_guests_used, 0), coalesce(x.n, 0))
  from (
    select e.owner_id, count(*) as n
      from public.guests g
      join public.events e on e.id = g.event_id
     where not e.is_paid
       and not coalesce(e.is_demo, false)
     group by e.owner_id
  ) x
 where p.id = x.owner_id;

-- -------------------------------------------------------------
-- ٤. الختم عند الإضافة
--
-- security definer عمداً هنا — عكس الحارسين: الدالة تحتاج أن تكتب في
-- ملف الحساب وهي تعمل بهوية المستخدم، وأن تمرّ من حارس الملف الذي
-- يمنع تعديل free_guests_used من المتصفح.
-- -------------------------------------------------------------
create or replace function public.stamp_guest_free_seq()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_counts boolean;
begin
  select e.owner_id,
         (not e.is_paid and not coalesce(e.is_demo, false))
    into v_owner, v_counts
    from public.events e
   where e.id = new.event_id;

  -- المدفوعة والتجريبية خارج الدفتر — ولا نقبل رقماً يرسله المتصفح
  if v_owner is null or not coalesce(v_counts, false) then
    new.free_seq := null;
    return new;
  end if;

  update public.profiles
     set free_guests_used = coalesce(free_guests_used, 0) + 1
   where id = v_owner
  returning free_guests_used into new.free_seq;

  return new;
end;
$$;

drop trigger if exists guests_free_seq_stamp on public.guests;
create trigger guests_free_seq_stamp
  before insert on public.guests
  for each row execute function public.stamp_guest_free_seq();

-- -------------------------------------------------------------
-- ٥. حارس الرقم بعد ختمه
--
-- بدونه يستطيع صاحب المناسبة من متصفحه: update guests set free_seq = 1
-- فيقفز مدعوه الحادي عشر إلى أول الدفتر ويعمل باركوده بلا دفع.
-- security invoker عمداً: definer تبدّل current_user لمالك الدالة
-- فيصير الحارس أعمى عن هوية المنفّذ.
-- -------------------------------------------------------------
create or replace function public.guard_guest_free_seq()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.free_seq is distinct from old.free_seq then
    raise exception 'لا يجوز تعديل رقم الدعوة المجانية من المتصفح'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guests_free_seq_guard on public.guests;
create trigger guests_free_seq_guard
  before update on public.guests
  for each row execute function public.guard_guest_free_seq();

-- -------------------------------------------------------------
-- ٦. حارس الملف يشمل الرصيد المستهلك
--
-- وإلا صفّره المستخدم من متصفحه: update profiles set free_guests_used = 0
-- وهو باب أوسع من الحذف نفسه.
-- -------------------------------------------------------------
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.is_super_admin      is distinct from old.is_super_admin
  or new.is_suspended        is distinct from old.is_suspended
  or new.free_quota_override is distinct from old.free_quota_override
  or new.free_guests_used    is distinct from old.free_guests_used
  or new.id                  is distinct from old.id then
    raise exception 'لا يجوز تعديل صلاحيات الحساب أو حصته من المتصفح'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- -------------------------------------------------------------
-- ٧. حساب التجاوز يقرأ الدفتر
--
-- الترتيب كما هو. الجديد أن فرع الحصة المجانية على الحساب صار يقرأ
-- رقم المدعو المختوم بدل أن يعدّ الصفوف الباقية.
-- -------------------------------------------------------------
create or replace function public.guest_over_limit(g public.guests, e public.events)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- المناسبة التجريبية لا تُحاسَب أبداً: هي باب التعرّف على المنصة
    when coalesce(e.is_demo, false) then false

    when exists (
      select 1 from public.subscriptions s
      where s.user_id = e.owner_id
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
    ) then false

    when e.is_paid then coalesce(
      (
        select count(*) from public.guests g2
        where g2.event_id = e.id and g2.created_at <= g.created_at
      ) > (select p.guests_limit from public.plans p where p.id = e.plan_id),
      false  -- باقة بلا حد (guests_limit = null) أو بلا باقة ⇒ بلا حد
    )

    -- الحصة المجانية على مستوى الحساب: رقم المدعو في الدفتر
    when coalesce(
           (select s.value #>> '{}' from public.site_settings s
             where s.key = 'free_quota_scope'),
           'per_account'
         ) = 'per_account'
    then coalesce(
           g.free_seq::bigint,
           -- مدعو أُضيف قبل هذا الترحيل ولم يُختم: نعود للعدّ المباشر
           (
             select count(*)
               from public.guests g2
               join public.events e2 on e2.id = g2.event_id
              where e2.owner_id = e.owner_id
                and not e2.is_paid
                and not coalesce(e2.is_demo, false)
                and g2.created_at <= g.created_at
           )
         ) > public.account_free_allowance(e.owner_id)

    -- النطاق القديم: لكل مناسبة على حدة
    else (
      select count(*) from public.guests g2
      where g2.event_id = e.id and g2.created_at <= g.created_at
    ) > e.free_quota
  end;
$$;

-- -------------------------------------------------------------
-- ٨. صفحة الفحص تتأكد أن الحرّاس الأربعة مركّبون
-- -------------------------------------------------------------
create or replace function public.security_guards_installed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
      from unnest(array[
        'profiles_privilege_guard',
        'events_billing_guard',
        'guests_free_seq_stamp',
        'guests_free_seq_guard'
      ]) as required(name)
     where not exists (
       select 1 from pg_trigger
        where tgname = required.name and not tgisinternal
     )
  );
$$;

do $$ begin
  grant execute on function public.security_guards_installed() to anon, authenticated;
  grant execute on function public.account_free_allowance(uuid) to anon, authenticated;
exception when undefined_object then null; end $$;`,
  '0022_retire_design_sharing.sql': `-- =============================================================
-- 0022 — إلغاء مشاركة العميل لتصميمه في الصفحة الرئيسية
--
-- الميزة كانت: مفتاح في محرّر التصميم يوافق به صاحب المناسبة على عرض
-- دعوته في الرئيسية، وعرضٌ عام (shared_designs) يكشفها للزوار.
--
-- أُلغيت بقرار صاحب المنصة: طلبٌ يقع في منتصف عمل العميل — وهو مشغول
-- بمناسبته لا بتسويق المنصة — فلا أحد يفعّله، ويبقى القسم فارغاً في
-- الرئيسية. ومعرض الأعمال (gallery_items) يؤدي الغرض نفسه بأعمال
-- يختارها صاحب المنصة.
--
-- والعرض العام يُحذف أولاً: ما دام لا أحد يشارك، فبقاؤه فتحةُ كشفٍ
-- لتصاميم العملاء بلا مقابل.
-- =============================================================

drop view if exists public.shared_designs;

-- الموافقة نفسها لم تعد تعني شيئاً بعد رفع الميزة، والعمودان يبقيان
-- إغراءً لكتابة قارئة لهما لاحقاً
alter table public.events
  drop column if exists shared_design,
  drop column if exists shared_at;`,
  '0023_reviews.sql': `-- =============================================================
-- 0023 — تقييمات العملاء
--
-- المسار: العميل يقيّم الخدمة من لوحته ← التقييم يصل صاحب المنصة في
-- «التقييمات» بحالة «بانتظار المراجعة» ← يقرّر هو نشره للزوار أو لا.
-- ويقدر يضيف تقييمات من عنده لأعمال نُفِّذت خارج المنصة.
--
-- القاعدة الحاكمة: لا شيء يظهر للزائر إلا بموافقة صريحة. النشر قرار
-- صاحب المنصة وحده، ولهذا لا يكفي أن نكتب \`status\` ونثق: حارسٌ قبل
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
on conflict (key) do nothing;`,
  '0024_test_payments_and_renewal.sql': `-- =============================================================
-- 0024 — اختبار الشراء قبل ربط البوابة، وتذكير تجديد الاشتراك
--
-- ١. payments_test_mode
--    قبل ربط مُيسّر لا توجد أي طريقة لاختبار «ماذا يحدث بعد الشراء»:
--    هل يُرفع الحد فعلاً؟ هل تعمل الباركودات؟ هل تتغيّر البطاقة في
--    اللوحة؟ كلها لا تُعرف إلا بشراء حقيقي — وهو ما لا يمكن قبل الربط.
--
--    الوضع التجريبي يحاكي الدفع الناجح بنفس المسار تماماً (نفس سجل
--    الدفع، نفس دالة التفعيل، نفس صفحة النتيجة) بلا اتصال بالبوابة.
--
--    وحارسه ليس في الإعداد وحده: الكود يتجاهله متى ضُبط مفتاح مُيسّر.
--    فلحظة تفعيل البوابة الحقيقية يموت الوضع التجريبي وحده، ولو نُسي
--    الإعداد مفتوحاً. نسيانُ إعدادٍ كهذا في منصة يديرها شخص واحد ليس
--    احتمالاً بعيداً — فلا نتركه ممكناً أصلاً.
--
-- ٢. subscriptions.renewal_notice_for
--    فواتير مُيسّر دفعة واحدة لا اشتراك متكرر: لا يُخصم شيء تلقائياً
--    عند انتهاء الشهر. والمشترك اليوم لا يعرف متى ينتهي اشتراكه إلا لو
--    فتح صفحة الدفع — فيكتشف انتهاءه حين تتوقف باركوداته على الباب.
--
--    العمود يحفظ نهاية الفترة التي أُرسل عنها التذكير، فلا يتكرر
--    التذكير لنفس الفترة، ويُسمح به من جديد فور التجديد لأن النهاية
--    تتغيّر. حقل «أُرسل/لم يُرسل» وحده كان سيصمت بعد أول تجديد.
-- =============================================================

insert into public.site_settings (key, value, label) values
  ('payments_test_mode', 'false'::jsonb,
   'وضع اختبار الدفع: يحاكي شراءً ناجحاً بلا بوابة. يتعطّل تلقائياً متى رُبطت مُيسّر.')
on conflict (key) do nothing;

alter table public.subscriptions
  add column if not exists renewal_notice_for timestamptz;

comment on column public.subscriptions.renewal_notice_for is
  'نهاية الفترة التي أُرسل عنها تذكير التجديد — يمنع تكرار التذكير ويسمح به بعد كل تجديد';

-- المهمة اليومية تبحث عن الاشتراكات المقاربة على الانتهاء والمنتهية
create index if not exists subscriptions_period_end_idx
  on public.subscriptions (status, current_period_end);`,
};

/** نص ترحيل بعينه، أو null إن لم يكن مضمّناً */
export function migrationSql(file: string): string | null {
  return MIGRATION_SQL[file] ?? null;
}
