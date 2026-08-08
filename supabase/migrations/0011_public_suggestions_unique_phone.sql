-- =============================================================
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
exception when undefined_object then null; end $$;
