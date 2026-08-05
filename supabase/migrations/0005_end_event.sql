-- =============================================================
-- بكجات — إنهاء المناسبة يوقف المسح فوراً + رسالة أوضح للباركود الغريب
-- =============================================================

-- المشكلة: زر «إنهاء المناسبة» يضبط status = 'ended' وended_manually_at،
-- لكن الدالة كانت تتحقق من 'archived' فقط، وتمرّر الإنهاء اليدوي عبر مهلة
-- الانتهاء (يوم كامل). فتظهر المناسبة «منتهية» في الواجهة بينما الباركودات
-- ما زالت تُقبل على الباب ٢٤ ساعة إضافية.
--
-- الإصلاح: الإنهاء — يدوياً أو بتغيير الحالة — يوقف المسح في اللحظة نفسها.
-- مهلة الانتهاء تبقى للنهاية التلقائية وحدها (تسامح مع المدعوين المتأخرين).

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

    -- تفعيل يدوي: يتجاوز كل ما دونه (بما فيه الإنهاء) عدا حدّ الباقة
    when e.activation_override = 'open' then
      case
        when not e.is_paid and (
          select count(*) from public.guests g2
          where g2.event_id = e.id and g2.created_at <= g.created_at
        ) > e.free_quota then 'inactive'
        else 'active'
      end

    -- المناسبة أُنهيت: لا مسح بعد ذلك مهما بقي من مهلة
    when e.status in ('ended', 'archived') then 'expired'
    when e.ended_manually_at is not null then 'expired'

    -- النهاية التلقائية وحدها هي التي تحصل على مهلة تسامح
    when now() > coalesce(e.ends_at, e.starts_at + interval '6 hours')
                 + make_interval(mins => e.expiry_grace_minutes) then 'expired'

    when now() < e.starts_at - make_interval(mins => e.activation_lead_minutes) then 'inactive'

    when not e.is_paid and (
      select count(*) from public.guests g2
      where g2.event_id = e.id and g2.created_at <= g.created_at
    ) > e.free_quota then 'inactive'

    else 'active'
  end;
$$;

-- =============================================================
-- المسح: تمييز باركود مناسبة أخرى عن باركود غير موجود إطلاقاً
-- =============================================================

create or replace function public.process_scan(
  p_scanner_id uuid,
  p_code       text,
  p_override   boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scanner  public.scanner_accounts;
  v_event    public.events;
  v_guest    public.guests;
  v_tag      public.event_tags;
  v_state    text;
  v_result   public.checkin_result;
  v_uuid     uuid;
  v_attended integer;
  v_total    integer;
  v_foreign  boolean;
begin
  select * into v_scanner from public.scanner_accounts where id = p_scanner_id and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'result', 'invalid', 'message', 'حساب المسح غير صالح');
  end if;

  select * into v_event from public.events where id = v_scanner.event_id;

  -- الرمز داخل الـ QR هو UUID؛ أي شيء آخر مرفوض فوراً
  begin
    v_uuid := p_code::uuid;
  exception when others then
    insert into public.checkins (event_id, scanner_id, scanner_name, result, raw_code)
    values (v_event.id, v_scanner.id, v_scanner.display_name, 'invalid', left(p_code, 120));
    return jsonb_build_object('ok', false, 'result', 'invalid', 'message', 'باركود غير صالح');
  end;

  -- القفل يضمن أن محاولتين متزامنتين لا تنجحان معاً
  select * into v_guest
  from public.guests
  where code = v_uuid and event_id = v_event.id
  for update;

  if not found then
    -- نميّز: هل الباركود يخص مناسبة أخرى أم لا وجود له أصلاً؟
    select exists (select 1 from public.guests where code = v_uuid) into v_foreign;

    insert into public.checkins (event_id, scanner_id, scanner_name, result, raw_code, note)
    values (
      v_event.id, v_scanner.id, v_scanner.display_name, 'invalid', left(p_code, 120),
      case when v_foreign then 'باركود يخص مناسبة أخرى' else 'باركود غير معروف' end
    );

    return jsonb_build_object(
      'ok', false,
      'result', 'invalid',
      'message', case
        when v_foreign then 'هذا الباركود يخص مناسبة أخرى — لا يُقبل هنا'
        else 'باركود غير معروف في المنصة'
      end
    );
  end if;

  select * into v_tag from public.event_tags where id = v_guest.tag_id;
  v_state := public.guest_code_state(v_guest, v_event);

  if v_state = 'used' and not p_override then
    insert into public.checkins (event_id, guest_id, scanner_id, scanner_name, result)
    values (v_event.id, v_guest.id, v_scanner.id, v_scanner.display_name, 'duplicate');
    v_result := 'duplicate';

  elsif v_state in ('inactive', 'expired') and not p_override then
    insert into public.checkins (event_id, guest_id, scanner_id, scanner_name, result)
    values (v_event.id, v_guest.id, v_scanner.id, v_scanner.display_name, v_state::public.checkin_result);
    v_result := v_state::public.checkin_result;

  else
    update public.guests
    set checked_in_at = coalesce(checked_in_at, now()),
        checked_in_by = coalesce(checked_in_by, v_scanner.id),
        entries_count = entries_count + 1
    where id = v_guest.id
    returning * into v_guest;

    if p_override and v_state <> 'active' then
      v_result := 'override';
      insert into public.checkins (event_id, guest_id, scanner_id, scanner_name, result, is_override, note)
      values (v_event.id, v_guest.id, v_scanner.id, v_scanner.display_name, 'override', true,
              'تجاوز يدوي — الحالة قبل التجاوز: ' || v_state);
    else
      v_result := 'granted';
      insert into public.checkins (event_id, guest_id, scanner_id, scanner_name, result)
      values (v_event.id, v_guest.id, v_scanner.id, v_scanner.display_name, 'granted');
    end if;
  end if;

  select count(*) filter (where checked_in_at is not null), count(*)
  into v_attended, v_total
  from public.guests where event_id = v_event.id;

  return jsonb_build_object(
    'ok', v_result in ('granted', 'override'),
    'result', v_result,
    'state_before', v_state,
    'guest', jsonb_build_object(
      'id', v_guest.id,
      'name', v_guest.name,
      'seats', v_guest.seats,
      'checked_in_at', v_guest.checked_in_at,
      'entries_count', v_guest.entries_count,
      'tag', case when v_tag.id is null then null
             else jsonb_build_object('name', v_tag.name, 'color', v_tag.color) end
    ),
    'stats', jsonb_build_object('attended', v_attended, 'total', v_total)
  );
end;
$$;

revoke all on function public.process_scan(uuid, text, boolean) from public, anon, authenticated;
