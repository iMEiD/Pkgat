-- =============================================================
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
$$;
