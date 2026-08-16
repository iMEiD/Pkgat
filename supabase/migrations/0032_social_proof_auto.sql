-- =============================================================
-- 0032 — الإثبات الاجتماعي: أرقام تُحسب من قاعدة البيانات
--
-- شريط الأرقام كان يقرأ ما يكتبه الأدمن بيده. وهذا يفتح باباً لا ينبغي
-- أن يُفتح في منصةٍ موضوعُها التحقق: الرقم المُختلَق في موضع «إثبات»
-- يهدم الثقة في المنتج كله حين ينكشف، لا في الرقم وحده.
--
-- فصار للشريط وضعان:
--
--   auto   — تُحسب الأرقام من الجداول. لا يمكن تزويرها ولا نسيان
--            تحديثها، وتكبر مع المنصة بنفسها.
--   manual — ما يكتبه الأدمن، للتجربة والمعاينة قبل الإطلاق.
--
-- ومع الوضع التلقائي حدٌّ أدنى: تحته لا يُعرض شيء. «٣ مناسبات» أسوأ
-- من الصمت — يقول للزائر إن أحداً لم يجرّب هذا بعد.
--
-- والدالة security definer لأنها تعدّ صفوفاً لا يملك الزائر قراءتها،
-- ولا تُعيد إلا رقمين مجمَّعين — لا صفّاً ولا اسماً ولا معرّفاً.
-- =============================================================

insert into public.site_settings (key, value, label) values
  ('social_proof_mode', '"auto"'::jsonb,
   'مصدر أرقام الإثبات: auto = تُحسب من قاعدة البيانات · manual = ما تكتبه أنت'),
  ('social_proof_min', '25'::jsonb,
   'الحد الأدنى للمناسبات قبل إظهار الشريط (في الوضع التلقائي فقط)')
on conflict (key) do nothing;

-- =============================================================
-- الأرقام الحقيقية
-- =============================================================

create or replace function public.platform_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- المناسبات الحقيقية: لا التجريبية ولا المسوّدات
    'events', (
      select count(*)
        from public.events e
       where coalesce(e.is_demo, false) = false
         and e.status <> 'draft'
    ),
    -- المدعوون الذين دخلوا فعلاً — لا الذين أُضيفوا فقط
    'guests', (
      select count(*)
        from public.guests g
        join public.events e on e.id = g.event_id
       where g.checked_in_at is not null
         and coalesce(e.is_demo, false) = false
    )
  );
$$;

comment on function public.platform_stats() is
  'أرقام الإثبات الاجتماعي مجمَّعة. security definer لأن الزائر لا يقرأ الجداول، ولا تُعيد إلا عددين.';

do $$ begin
  grant execute on function public.platform_stats() to anon, authenticated;
exception when undefined_object then null; end $$;
