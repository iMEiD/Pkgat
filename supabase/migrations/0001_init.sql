-- =============================================================
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
  with check (bucket_id in ('templates', 'gallery') and public.is_super_admin());
