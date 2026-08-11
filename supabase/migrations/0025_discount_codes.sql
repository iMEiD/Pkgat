-- =============================================================
-- 0025 — أكواد الخصم وأكواد المسوّقين
--
-- كود واحد يخدم غرضين حسب ما يُملأ فيه:
--   خصم عادي  ⇒ نسبة أو مبلغ ثابت، على باقات بعينها أو كلها
--   كود مسوّق ⇒ نفس الخصم + اسم المسوّق ونسبة عمولته، فيُحسب المستحق له
--
-- ولا يُحسب سعر في المتصفح إطلاقاً: العميل يرسل نص الكود لا أكثر،
-- والخادم هو من يقرأ الباقة ويطبّق الخصم ويبني الفاتورة. أي حساب في
-- المتصفح يعني كوداً بنسبة ١٠٠٪ يصنعه المشتري بنفسه.
--
-- والاستهلاك يُسجَّل صفّاً لكل استعمال (discount_redemptions) لا عدّاداً
-- وحده: بها وحدها يُعرف من استعمل، وكم مرة، وكم يستحق المسوّق — ولا
-- يُعرف شيء من ذلك برقمٍ يزيد.
-- =============================================================

create table if not exists public.discount_codes (
  id           uuid primary key default gen_random_uuid(),

  -- يُخزَّن بحروف كبيرة دائماً، والمقارنة تُطبّع عليه فلا يهم كيف كتبه العميل
  code         text not null unique,
  label        text,

  kind         text not null check (kind in ('percent', 'fixed')),
  -- نسبة ١–١٠٠ حين percent، ومبلغ بالهللات حين fixed
  value        integer not null check (value > 0),

  -- الباقات المشمولة — الفراغ يعني كل الباقات
  plan_ids     uuid[] not null default '{}',

  -- حدود الاستعمال: null في max_uses يعني بلا سقف
  max_uses          integer check (max_uses is null or max_uses > 0),
  max_uses_per_user integer not null default 1 check (max_uses_per_user > 0),
  used_count        integer not null default 0,

  starts_at    timestamptz,
  expires_at   timestamptz,
  is_active    boolean not null default true,

  -- كود المسوّق: الاسم للتقرير، والنسبة لحساب المستحق من المبلغ المدفوع
  marketer_name       text,
  commission_percent  numeric(5, 2)
    check (commission_percent is null or (commission_percent >= 0 and commission_percent <= 100)),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists discount_codes_active_idx
  on public.discount_codes (is_active, expires_at);

/**
 * سجل استعمال — صفّ لكل مرة استُعمل فيها الكود بنجاح.
 *
 * payment_id فريد: الدفعة الواحدة لا تُحسب مرتين مهما تكرر استدعاء
 * التفعيل (وهو يُستدعى من صفحة الرجوع ومن الويب-هوك معاً).
 */
create table if not exists public.discount_redemptions (
  id                 uuid primary key default gen_random_uuid(),
  code_id            uuid not null references public.discount_codes (id) on delete cascade,
  user_id            uuid references public.profiles (id) on delete set null,
  payment_id         uuid not null unique references public.payments (id) on delete cascade,

  -- القيم منسوخة وقت الاستعمال: تعديل الكود لاحقاً لا يغيّر تاريخاً مضى
  original_halalas   integer not null,
  discount_halalas   integer not null,
  paid_halalas       integer not null,
  commission_halalas integer not null default 0,

  created_at         timestamptz not null default now()
);

create index if not exists discount_redemptions_code_idx
  on public.discount_redemptions (code_id, created_at desc);
create index if not exists discount_redemptions_user_idx
  on public.discount_redemptions (user_id);

-- الدفعة تحمل أثر الكود، فيظهر في سجل المدفوعات وفي أي مراجعة لاحقة
alter table public.payments
  add column if not exists discount_code_id uuid references public.discount_codes (id) on delete set null,
  add column if not exists discount_halalas integer not null default 0;

-- -------------------------------------------------------------
-- السياسات: لا شيء من هذا يُقرأ أو يُكتب من المتصفح
--
-- التحقق من الكود يمر بإجراء خادم بمفتاح الخدمة. ولو فُتحت القراءة
-- للمستخدمين لصار جدول الأكواد قائمةً تُقرأ: يجرّبها الزائر واحداً
-- واحداً حتى يجد أعلاها خصماً.
-- -------------------------------------------------------------
alter table public.discount_codes       enable row level security;
alter table public.discount_redemptions enable row level security;

drop policy if exists discount_codes_admin on public.discount_codes;
create policy discount_codes_admin on public.discount_codes
  for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists discount_redemptions_admin on public.discount_redemptions;
create policy discount_redemptions_admin on public.discount_redemptions
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- -------------------------------------------------------------
-- الحجز الذرّي لاستعمال الكود
--
-- «تحقّقنا ثم زدنا العدّاد» يسمح لمشتريين متزامنين بتجاوز السقف معاً:
-- كلاهما يقرأ used_count نفسه قبل أن يكتب أيّهما. الشرط داخل جملة
-- UPDATE نفسها يجعل الفحص والزيادة عملية واحدة لا تنقسم.
--
-- تعيد true حين نجح الحجز، وfalse حين نفد السقف.
-- -------------------------------------------------------------
create or replace function public.claim_discount_use(p_code_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with claimed as (
    update public.discount_codes
       set used_count = used_count + 1,
           updated_at = now()
     where id = p_code_id
       and (max_uses is null or used_count < max_uses)
    returning id
  )
  select exists (select 1 from claimed);
$$;

-- -------------------------------------------------------------
-- تقرير المسوّقين — ما استُعمل وما استُحق
-- -------------------------------------------------------------
create or replace view public.discount_code_stats
with (security_invoker = true) as
  select
    c.id,
    c.code,
    c.label,
    c.marketer_name,
    c.commission_percent,
    c.is_active,
    c.used_count,
    c.max_uses,
    count(r.id)                                as redemptions,
    coalesce(sum(r.discount_halalas), 0)::bigint  as total_discount_halalas,
    coalesce(sum(r.paid_halalas), 0)::bigint      as total_paid_halalas,
    coalesce(sum(r.commission_halalas), 0)::bigint as total_commission_halalas,
    max(r.created_at)                          as last_used_at
  from public.discount_codes c
  left join public.discount_redemptions r on r.code_id = c.id
  group by c.id;
