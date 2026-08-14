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

-- -------------------------------------------------------------
-- إثبات أن الترتيب الجديد نُفِّذ فعلاً
--
-- guest_code_state موجودة منذ الترحيل الأول، فوجودها لا يثبت شيئاً عن
-- هذا الترحيل — وفحصٌ يسأل عن وجودها يخرج «مكتمل» أبداً ولو لم يُنفَّذ
-- الترحيل قط. وهذا بالضبط ما تقوم صفحة الفحص لتمنعه.
--
-- فنُثبت السلوك لا الوجود: نبني صفَّي مناسبة ومدعو في الذاكرة — لا
-- يُكتب منهما شيء في أي جدول — ونسأل الدالة عن حالتهما. مناسبة منتهية
-- ومفعّلة يدوياً يجب أن تخرج 'expired'؛ فإن خرجت 'active' فالترتيب
-- القديم ما زال قائماً.
-- -------------------------------------------------------------
create or replace function public.ended_blocks_scanning()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_guest public.guests;
begin
  v_event.id                      := gen_random_uuid();
  v_event.owner_id                := gen_random_uuid();
  v_event.status                  := 'ended';
  v_event.activation_override     := 'open';
  v_event.starts_at               := now() - interval '2 hours';
  v_event.ends_at                 := now() + interval '2 hours';
  v_event.activation_lead_minutes := 15;
  v_event.expiry_grace_minutes    := 1440;
  v_event.free_quota              := 10;
  v_event.is_paid                 := false;
  v_event.is_demo                 := false;

  v_guest.id         := gen_random_uuid();
  v_guest.event_id   := v_event.id;
  v_guest.created_at := now();
  v_guest.free_seq   := 1;

  return public.guest_code_state(v_guest, v_event) = 'expired';
end;
$$;

do $$ begin
  grant execute on function public.ended_blocks_scanning() to anon, authenticated;
exception when undefined_object then null; end $$;
