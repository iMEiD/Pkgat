-- =============================================================
-- 0036 — تأكيد الحضور (RSVP)
--
-- المدعو يفتح رابطاً خاصاً به، يرى الدعوة، ويردّ: أحضر أو أعتذر.
-- وباركوده لا يُولَّد له إلا بعد أن يؤكّد.
--
-- ولماذا هذا تغيير في المنتج لا إضافة إليه:
--
-- اليوم نرسم صورةً لكل مدعو — اسمه وباركوده محروقان داخل الصورة —
-- ثم يُنزّلها صاحب المناسبة ZIP ويرسلها بنفسه. وهذا يعمل ما دام
-- المرسِل بشراً. فإن أرسلت المنصة آلياً انهار: خمسمئة مدعو تعني
-- خمسمئة صورة مختلفة تُرفع واحدةً واحدة لواتساب — بطيءٌ ومكلف
-- وينكسر في منتصفه.
--
-- والحلّ أن تكون الصورة واحدة للجميع، والاسم في نصّ الرسالة،
-- والباركود في الصفحة. وهذا بالضبط ما يفعله من سبقنا.
--
-- لكن الطريقة القديمة تبقى: من يطبع دعواته على ورق، ومن يرسلها
-- بنفسه من جوّاله، لا يحتاج صفحةً ولا تأكيداً. فصار الأمر مفتاحاً
-- لكل مناسبة (events.rsvp_enabled) لا قراراً على المنصة كلها،
-- ومطفأً افتراضياً حتى لا تتغيّر مناسبةٌ قائمة تحت يد صاحبها.
--
-- ورمزان لا واحد:
--
--   code          الباركود — يُمسح على الباب
--   invite_token  مفتاح الرابط العام
--
-- والفصل مقصود. لو كان الرابط هو الباركود نفسه، فكل رابط يتسرّب
-- يفرض إبطال الباركود، وإبطال الباركود يعني مدعواً واقفاً على
-- الباب برمزٍ لا يُقرأ. أما وهما اثنان فيُدوَّر الرابط وحده.
-- =============================================================

-- =============================================================
-- 1. المفتاح على المناسبة
-- =============================================================

alter table public.events
  add column if not exists rsvp_enabled boolean not null default false,
  -- رابط الموقع على الخريطة — المدعو يفتحه بضغطة بدل أن ينسخ اسم القاعة
  add column if not exists map_url text,
  -- ملاحظة تُقرأ في صفحة الدعوة. وهي غير events.notes: تلك ملاحظات
  -- صاحب المناسبة لنفسه («القاعة ما ردّت على الحجز»)، وخلطُ الاثنين
  -- في حقل واحد يعني تسريبها إلى المدعوين
  add column if not exists guest_note text;

comment on column public.events.rsvp_enabled is
  'مفعّل: الباركود لا يظهر إلا بعد تأكيد الحضور، والصورة تُرسل بلا باركود. مطفأ: الطريقة الأصلية (باركود داخل صورة كل مدعو).';

-- =============================================================
-- 2. حالة المدعو
-- =============================================================

alter table public.guests
  add column if not exists invite_token uuid not null default gen_random_uuid(),
  add column if not exists rsvp_status text not null default 'pending',
  add column if not exists rsvp_responded_at timestamptz,
  -- تهنئة يكتبها المدعو لصاحب المناسبة، أو عذره حين يعتذر
  add column if not exists rsvp_note text;

do $$ begin
  alter table public.guests
    add constraint guests_rsvp_status_check
    check (rsvp_status in ('pending', 'confirmed', 'declined'));
exception when duplicate_object then null; end $$;

create unique index if not exists guests_invite_token_idx on public.guests (invite_token);
create index if not exists guests_rsvp_status_idx on public.guests (event_id, rsvp_status);

-- =============================================================
-- 3. سجلّ الردود
--
-- المدعو يغيّر رأيه — يعتذر ثم تنفرج ظروفه فيؤكّد. ومنعُه من ذلك
-- يعطي صاحب المناسبة رقماً مريحاً لا صحيحاً، وهو يحجز الضيافة على
-- هذا الرقم. فالتغيير مسموح، وكلُّ تغييرٍ يُكتب: من ماذا إلى ماذا
-- ومتى — فيبقى للمنظّم أثرٌ يفسّر له تذبذب العدد.
-- =============================================================

create table if not exists public.guest_rsvp_log (
  id         uuid primary key default gen_random_uuid(),
  guest_id   uuid not null references public.guests (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  from_status text not null,
  to_status   text not null,
  note        text,
  -- guest: من صفحة الدعوة | owner: من لوحة صاحب المناسبة
  source      text not null default 'guest',
  created_at  timestamptz not null default now()
);

create index if not exists guest_rsvp_log_guest_idx on public.guest_rsvp_log (guest_id, created_at desc);
create index if not exists guest_rsvp_log_event_idx on public.guest_rsvp_log (event_id, created_at desc);

alter table public.guest_rsvp_log enable row level security;

drop policy if exists guest_rsvp_log_owner on public.guest_rsvp_log;
create policy guest_rsvp_log_owner on public.guest_rsvp_log
  for select using (public.owns_event(event_id));

-- =============================================================
-- 4. قراءة صفحة الدعوة
--
-- الزائر لا يملك جلسة ولا صفّاً يقرؤه، والرمز وحده هو إذنه. فالدالة
-- security definer، ولا تُعيد إلا ما تحتاجه الصفحة: لا هاتفاً، ولا
-- معرّف مالك، ولا اسم مدعوٍّ آخر — والباركود لا يخرج منها إلا بعد
-- التأكيد، وإلا لصار المنع شكلاً في الواجهة يكشفه أوّل من فتح
-- أدوات المطوّر.
-- =============================================================

create or replace function public.invite_view(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_guest public.guests;
  v_event public.events;
begin
  select * into v_guest from public.guests where invite_token = p_token;
  if not found then return null; end if;

  select * into v_event from public.events where id = v_guest.event_id;
  if not found then return null; end if;

  -- المناسبة المؤرشفة أو المسوّدة لا دعوة لها: الأولى انتهت،
  -- والثانية لم يُطلقها صاحبها بعد
  if v_event.status <> 'active' or not v_event.rsvp_enabled then
    return jsonb_build_object('state', 'closed');
  end if;

  return jsonb_build_object(
    'state',        'ok',
    'guest_name',   v_guest.name,
    'seats',        v_guest.seats,
    'rsvp_status',  v_guest.rsvp_status,
    'rsvp_note',    v_guest.rsvp_note,
    'responded_at', v_guest.rsvp_responded_at,
    -- الباركود بعد التأكيد لا قبله
    'code',         case when v_guest.rsvp_status = 'confirmed' then v_guest.code::text else null end,
    'checked_in',   v_guest.checked_in_at is not null,
    'event', jsonb_build_object(
      'title',     v_event.title,
      'type',      v_event.event_type,
      'starts_at', v_event.starts_at,
      'ends_at',   v_event.ends_at,
      'venue',     v_event.venue,
      'map_url',   v_event.map_url,
      -- guest_note لا notes: الثانية ملاحظات صاحب المناسبة لنفسه
      'note',      v_event.guest_note,
      'design',    v_event.design
    )
  );
end;
$$;

comment on function public.invite_view(uuid) is
  'بيانات صفحة الدعوة العامة. security definer لأن الزائر بلا جلسة، ولا تُعيد الباركود إلا بعد تأكيد الحضور.';

-- =============================================================
-- 5. تسجيل الرد
--
-- كل شيء في معاملة واحدة مع قفل الصف: التحديث والسجلّ معاً، فلا
-- يقع ردٌّ بلا أثر، ولا ضغطتان متتاليتان تكتبان سطرين متناقضين.
--
-- والردّ بعد الدخول مرفوض: من مُسح باركوده صار حاضراً فعلاً، وقولُه
-- بعدها «أعتذر» يُفسد إحصاء الحضور بلا معنى.
-- =============================================================

create or replace function public.rsvp_respond(
  p_token  uuid,
  p_status text,
  p_note   text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_guest public.guests;
  v_event public.events;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_status not in ('confirmed', 'declined') then
    return jsonb_build_object('ok', false, 'reason', 'bad_status');
  end if;

  select * into v_guest from public.guests where invite_token = p_token for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_event from public.events where id = v_guest.event_id;
  if not found or v_event.status <> 'active' or not v_event.rsvp_enabled then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  if v_guest.checked_in_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_attended');
  end if;

  -- التهنئة تُحفظ ولو لم تتغيّر الحالة: المدعو قد يعود ليكتبها وحدها
  update public.guests
     set rsvp_status       = p_status,
         rsvp_note         = coalesce(v_note, rsvp_note),
         rsvp_responded_at = now()
   where id = v_guest.id;

  insert into public.guest_rsvp_log (guest_id, event_id, from_status, to_status, note, source)
  values (v_guest.id, v_guest.event_id, v_guest.rsvp_status, p_status, v_note, 'guest');

  return jsonb_build_object(
    'ok',     true,
    'status', p_status,
    'code',   case when p_status = 'confirmed' then v_guest.code::text else null end
  );
end;
$$;

comment on function public.rsvp_respond(uuid, text, text) is
  'تسجيل رد المدعو مع أثره في guest_rsvp_log. المدعو يملك تغيير رده ما لم يكن قد دخل فعلاً.';

do $$ begin
  grant execute on function public.invite_view(uuid) to anon, authenticated;
  grant execute on function public.rsvp_respond(uuid, text, text) to anon, authenticated;
exception when undefined_object then null; end $$;

-- =============================================================
-- 6. نصوص صفحة الدعوة — قابلة للتحرير من لوحة الأدمن
-- =============================================================

insert into public.site_settings (key, value, label) values
  ('invite_confirm_title', '"تم تأكيد حضورك"'::jsonb,
   'عنوان رسالة التأكيد في صفحة الدعوة'),
  ('invite_confirm_body', '"احفظ الباركود أو صوّر الشاشة، وأبرزه عند البوابة."'::jsonb,
   'نص رسالة التأكيد في صفحة الدعوة'),
  ('invite_decline_title', '"وصلنا اعتذارك"'::jsonb,
   'عنوان رسالة الاعتذار في صفحة الدعوة'),
  ('invite_decline_body', '"شكراً لإخبارنا. نتطلع لرؤيتك في مناسبة قادمة."'::jsonb,
   'نص رسالة الاعتذار في صفحة الدعوة'),
  ('invite_note_label', '"تهنئة لصاحب المناسبة"'::jsonb,
   'عنوان صندوق التهنئة في صفحة الدعوة'),
  ('invite_footer_enabled', 'true'::jsonb,
   'إظهار تذييل «صُنعت عبر بكجات» في صفحة الدعوة — كل مدعو يراه، وهو أوسع تعريف بالمنصة'),
  ('invite_footer_text', '"صُنعت هذه الدعوة عبر بكجات"'::jsonb,
   'نص تذييل صفحة الدعوة'),
  ('invite_footer_cta', '"اصنع دعوتك"'::jsonb,
   'نص زر التذييل في صفحة الدعوة')
on conflict (key) do nothing;
