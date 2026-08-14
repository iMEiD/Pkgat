-- =============================================================
-- 0026 — إنهاء المناسبة يسبق التفعيل اليدوي
--
-- الترتيب في guest_code_state كان يضع activation_override = 'open' قبل
-- فحص الانتهاء. فمن فعّل الباركودات يدوياً ثم أنهى مناسبته تبقى
-- باركوداته تعمل، وتقول له اللوحة «الباركودات مفعّلة» بينما هو أنهاها
-- بنفسه.
--
-- والمنطق أن الأحدث والأصرح يغلب: التفعيل اليدوي قرار يتجاوز التوقيت
-- التلقائي — لا يتجاوز إنهاءً صريحاً وقع بعده. ومن أنهى مناسبته يريدها
-- أن تنتهي، ولو نسي مفتاحاً تركه مفتوحاً قبل ساعات.
--
-- «موقوفة الآن» تبقى في مقدّمة الترتيب: هي إيقاف، وأثرها إيقاف.
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

    -- الإنهاء الصريح يسبق التفعيل اليدوي: من أنهى مناسبته أنهاها
    when e.status in ('ended', 'archived') then 'expired'
    when e.ended_manually_at is not null then 'expired'

    -- تفعيل يدوي: يتجاوز التوقيت وحده — الحد يبقى مطبَّقاً
    when e.activation_override = 'open' then
      case
        when public.guest_over_limit(g, e) then 'inactive'
        else 'active'
      end

    -- النهاية التلقائية وحدها هي التي تحصل على مهلة تسامح
    when now() > coalesce(e.ends_at, e.starts_at + interval '6 hours')
                 + make_interval(mins => e.expiry_grace_minutes) then 'expired'

    when now() < e.starts_at - make_interval(mins => e.activation_lead_minutes) then 'inactive'

    when public.guest_over_limit(g, e) then 'inactive'

    else 'active'
  end;
$$;
