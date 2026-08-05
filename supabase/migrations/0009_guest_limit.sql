-- =============================================================
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
$$;
