-- =============================================================
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
exception when undefined_object then null; end $$;
