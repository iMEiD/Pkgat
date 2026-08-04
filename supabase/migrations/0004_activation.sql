-- =============================================================
-- بكجات — نافذة تفعيل أقصر + تحكم يدوي بحالة الباركودات
-- =============================================================

-- التفعيل الافتراضي: ربع ساعة قبل المناسبة (كان ساعتين)
alter table public.events
  alter column activation_lead_minutes set default 15;

-- المناسبات القائمة التي لم يغيّر أصحابها القيمة تنتقل للافتراضي الجديد
update public.events
set activation_lead_minutes = 15
where activation_lead_minutes = 120;

-- تحكم يدوي يتجاوز التوقيت التلقائي:
--   auto   = حسب توقيت المناسبة (الافتراضي)
--   open   = مفعّلة الآن مهما كان الوقت
--   closed = موقوفة الآن مهما كان الوقت
alter table public.events
  add column if not exists activation_override text not null default 'auto';

do $$ begin
  alter table public.events
    add constraint events_activation_override_check
    check (activation_override in ('auto', 'open', 'closed'));
exception when duplicate_object then null; end $$;

-- =============================================================
-- حالة الباركود تحترم التجاوز اليدوي قبل أي حساب زمني
-- =============================================================

create or replace function public.guest_code_state(g public.guests, e public.events)
returns text
language sql
stable
as $$
  select case
    -- الاستخدام يسبق كل شيء: باركود مُستهلك يبقى مُستهلكاً
    when g.checked_in_at is not null then 'used'

    -- إيقاف يدوي من صاحب المناسبة
    when e.activation_override = 'closed' then 'expired'

    -- تفعيل يدوي: يتجاوز التوقيت لكنه يظل خاضعاً لحدّ الباقة المجانية
    when e.activation_override = 'open' then
      case
        when not e.is_paid and (
          select count(*) from public.guests g2
          where g2.event_id = e.id and g2.created_at <= g.created_at
        ) > e.free_quota then 'inactive'
        else 'active'
      end

    when e.status = 'archived' then 'expired'
    when now() > public.event_effective_end(e) + make_interval(mins => e.expiry_grace_minutes) then 'expired'
    when now() < e.starts_at - make_interval(mins => e.activation_lead_minutes) then 'inactive'
    when not e.is_paid and (
      select count(*) from public.guests g2
      where g2.event_id = e.id and g2.created_at <= g.created_at
    ) > e.free_quota then 'inactive'
    else 'active'
  end;
$$;
