-- =============================================================
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
$$;
