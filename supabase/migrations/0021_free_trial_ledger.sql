-- =============================================================
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
-- الحساب. `greatest` تجعل إعادة تنفيذ الترحيل بلا ضرر: لا تُنقص رصيداً
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
exception when undefined_object then null; end $$;
