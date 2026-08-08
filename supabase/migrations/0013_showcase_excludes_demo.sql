-- =============================================================
-- 0013 — المناسبة التجريبية تخرج من معرض تصاميم العملاء
--
-- الخلل: عرض shared_designs يجمع كل مناسبة عليها shared_design ولها
-- خلفية — بما فيها «المناسبة التجريبية» التي تُنشأ تلقائياً لكل حساب
-- جديد. فيظهر في قسم «دعوات صمّمها عملاؤنا» عنصر تجريبي واحد بدل
-- تصاميم حقيقية، والعنوان يَعِد بما لا يفي به.
--
-- المناسبة التجريبية ليست عمل عميل، فلا مكان لها في معرض أعماله.
-- =============================================================

create or replace view public.shared_designs
with (security_invoker = false) as
  select
    e.id,
    e.title,
    e.event_type,
    e.design ->> 'backgroundUrl' as background_url,
    e.shared_at
  from public.events e
  where e.shared_design
    and e.design ->> 'backgroundUrl' is not null
    and not e.is_demo
  order by e.shared_at desc nulls last;

do $$ begin
  grant select on public.shared_designs to anon, authenticated;
exception when undefined_object then null; end $$;
