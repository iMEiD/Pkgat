-- =============================================================
-- بكجات — هوية الموقع اللونية قابلة للتعديل من لوحة الأدمن
-- =============================================================

insert into public.site_settings (key, value, label) values
  (
    'theme',
    '{"primary":"#6D4AFF","canvas":"#FFFDF9","sand":"#E7DAC3","ink":"#2A2521"}'::jsonb,
    'ألوان هوية الموقع'
  )
on conflict (key) do nothing;

-- نصوص إضافية في الصفحة الرئيسية صارت قابلة للتعديل
insert into public.site_content (key, page, label, kind, value, sort_order) values
  ('home.features.eyebrow', 'home', 'العنوان الصغير فوق قسم المميزات', 'text', '"المميزات"'::jsonb, 65),
  ('home.steps.eyebrow', 'home', 'العنوان الصغير فوق قسم الخطوات', 'text', '"كيف تشتغل"'::jsonb, 85),
  ('home.cta.primary', 'home', 'زر الدعوة النهائية الأساسي', 'text', '"أنشئ حسابك الآن"'::jsonb, 125),
  ('home.cta.secondary', 'home', 'زر الدعوة النهائية الثانوي', 'text', '"شوف الباقات"'::jsonb, 130)
on conflict (key) do nothing;
