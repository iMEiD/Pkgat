-- =============================================================
-- 0008 — المناسبة التجريبية وتذكير ما قبل المناسبة
--
-- ١. demo_seeded: علامة على الملف تمنع إعادة زرع المناسبة التجريبية
--    كلما فتح المستخدم لوحته — لو حذفها فهو قرار منه، لا خطأ نصلحه له.
-- ٢. reminder_sent_at: تمنع تكرار تذكير المناسبة الواحدة، لأن مهمة
--    التذكير تعمل كل ساعة والنافذة الزمنية تغطي أكثر من تشغيل واحد.
-- ٣. is_demo: تمييز المناسبة التجريبية حتى لا تُحسب في الإحصاءات ولا
--    يُرسل لها تذكير.
-- =============================================================

alter table public.profiles
  add column if not exists demo_seeded boolean not null default false;

comment on column public.profiles.demo_seeded is
  'زُرعت المناسبة التجريبية لهذا المستخدم — لا تُزرع مرة أخرى';

alter table public.events
  add column if not exists is_demo          boolean not null default false,
  add column if not exists reminder_sent_at timestamptz;

comment on column public.events.is_demo is
  'مناسبة تجريبية مزروعة تلقائياً للتعرّف على المنصة';
comment on column public.events.reminder_sent_at is
  'وقت إرسال تذكير ما قبل المناسبة — يمنع التكرار';

create index if not exists events_reminder_idx
  on public.events (starts_at)
  where reminder_sent_at is null and not is_demo;

-- الحسابات القائمة لا تحتاج مناسبة تجريبية بأثر رجعي: من أنشأ مناسبة
-- فعلية تجاوز مرحلة التعرّف أصلاً
update public.profiles p
   set demo_seeded = true
 where exists (select 1 from public.events e where e.owner_id = p.id);
