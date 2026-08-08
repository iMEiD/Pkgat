-- =============================================================
-- 0016 — المعرض يعرض الدعوة كاملة لا خلفيتها وحدها
--
-- الخلل: العرض كان يكشف backgroundUrl فقط، فتظهر في المعرض صورة
-- خلفية بلا اسم المناسبة ولا تاريخها ولا مكانها ولا أي نص كتبه صاحبها.
-- والعميل حين يشارك عمله إنما يشارك الدعوة التي صمّمها بكل تفاصيلها،
-- لا الورقة التي بنى عليها.
--
-- الحل: كشف كائن التصميم كاملاً، فترسمه الواجهة بنفس الدالة التي
-- تولّد الدعوات الحقيقية — فيظهر ما صنعه العميل كما هو تماماً.
--
-- الخصوصية: التصميم يحوي النصوص التي كتبها صاحب المناسبة والاسم
-- التجريبي في المحرّر — ولا يحوي أي بيان عن مدعوّ حقيقي. والعرض لا
-- يشمل إلا من فعّل المشاركة بنفسه.
-- =============================================================

create or replace view public.shared_designs
with (security_invoker = false) as
  select
    e.id,
    e.title,
    e.event_type,
    e.design ->> 'backgroundUrl' as background_url,
    e.shared_at,
    -- يُضاف في آخر القائمة عمداً: create or replace view لا يقبل إدراج
    -- عمود بين الأعمدة القائمة، بل الإلحاق في آخرها فقط
    e.design as design
  from public.events e
  where e.shared_design
    and e.design ->> 'backgroundUrl' is not null
    and not e.is_demo
  order by e.shared_at desc nulls last;

do $$ begin
  grant select on public.shared_designs to anon, authenticated;
exception when undefined_object then null; end $$;
