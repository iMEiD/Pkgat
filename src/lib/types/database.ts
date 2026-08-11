/**
 * أنواع قاعدة البيانات — مكتوبة يدوياً لتطابق supabase/migrations.
 * عند تعديل المخطط، حدّث هذا الملف (أو ولّده عبر `supabase gen types typescript`).
 */

export type EventStatus = 'draft' | 'ready' | 'live' | 'ended' | 'archived';
export type EventType = 'wedding' | 'graduation' | 'party' | 'other';
export type CodeState = 'inactive' | 'active' | 'used' | 'expired';
export type CheckinResult = 'granted' | 'duplicate' | 'invalid' | 'inactive' | 'expired' | 'override';
export type BillingPeriod = 'one_time' | 'monthly' | 'yearly';

/** إعدادات تصميم الدعوة المخزّنة في events.design */
export interface DesignConfig {
  /** مصدر الخلفية: قالب جاهز أو رفع خاص */
  source: 'template' | 'upload';
  backgroundUrl: string | null;
  /** أبعاد التصميم الأصلية بالبكسل — كل الإحداثيات نسبية إليها */
  width: number;
  height: number;
  name: NameLayer;
  qr: QrLayer;
  /** نصوص إضافية اختيارية (اسم المضيف، التاريخ) للقوالب الجاهزة */
  extras?: TextLayer[];
}

export interface TextLayer {
  id: string;
  label: string;
  text: string;
  /** إحداثيات نسبية 0..1 من عرض/ارتفاع التصميم */
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number; // نسبة من عرض التصميم (0..1)
  color: string;
  weight: number;
  align: 'center' | 'right' | 'left';
  /** اتجاه النص — يهم عند خلط العربية بالأرقام أو اللاتينية */
  direction?: 'rtl' | 'ltr';
  /** مضاعف ارتفاع السطر عند تعدد الأسطر */
  lineHeight?: number;
  letterSpacing?: number;
  shadow?: boolean;
}

export type NameLayer = Omit<TextLayer, 'id' | 'label' | 'text'> & {
  /** نص المعاينة فقط — يُستبدل باسم كل مدعو عند التوليد */
  sample: string;
};

export interface QrLayer {
  x: number;
  y: number;
  /** حجم الباركود كنسبة من عرض التصميم (0.05..0.5) */
  size: number;
  foreground: string;
  /** 'transparent' أو لون hex */
  background: string;
  /** هامش أبيض/ملون حول الباركود بالوحدات (quiet zone) */
  margin: number;
  rounded: boolean;
  visible: boolean;
}

export interface Json {
  [key: string]: unknown;
}

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  is_super_admin: boolean;
  is_suspended: boolean;
  totp_secret: string | null;
  totp_enabled: boolean;
  // موافقات المستخدم وقت التسجيل (PDPL)
  terms_accepted_at: string | null;
  marketing_consent: boolean;
  marketing_consent_at: string | null;
  // حصة دعوات خاصة منحها الأدمن — null يعني الإعداد العام
  free_quota_override: number | null;
  // دفتر التجربة المجانية: ما استُهلك طوال عمر الحساب. لا ينقص بالحذف.
  free_guests_used: number;
  // زُرعت المناسبة التجريبية لهذا المستخدم
  demo_seeded: boolean;
  created_at: string;
  updated_at: string;
}

export type EventRow = {
  id: string;
  owner_id: string;
  title: string;
  event_type: EventType;
  starts_at: string;
  ends_at: string | null;
  venue: string | null;
  notes: string | null;
  status: EventStatus;
  design: DesignConfig;
  template_id: string | null;
  activation_lead_minutes: number;
  expiry_grace_minutes: number;
  activation_override: 'auto' | 'open' | 'closed';
  free_quota: number;
  is_paid: boolean;
  paid_at: string | null;
  plan_id: string | null;
  ended_manually_at: string | null;
  // مناسبة تجريبية مزروعة تلقائياً للتعرّف على المنصة
  is_demo: boolean;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

/** اقتراح مستخدم — بيانات التواصل منسوخة وقت الإرسال لا مرجعاً حيّاً */
export type Suggestion = {
  id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  category: string;
  message: string;
  status: string;
  admin_note: string | null;
  created_at: string;
}

export type ReviewStatus = 'pending' | 'published' | 'hidden';

/**
 * تقييم عميل للخدمة.
 * الاسم والصفة منسوخان وقت الإرسال لا مرجعاً حيّاً — فالمنشور باسمٍ
 * لا يتغيّر لو غيّر صاحبه اسمه أو حذف حسابه.
 */
export type Review = {
  id: string;
  user_id: string | null;
  author_name: string;
  author_title: string | null;
  rating: number;
  body: string;
  status: ReviewStatus;
  /** customer: كتبه صاحبه · admin: أضافه صاحب المنصة */
  source: 'customer' | 'admin';
  sort_order: number;
  admin_note: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/** ما يراه الزائر من التقييم — بلا هوية صاحبه ولا حالة مراجعته */
export type PublishedReview = {
  id: string;
  author_name: string;
  author_title: string | null;
  rating: number;
  body: string;
  published_at: string | null;
  sort_order: number;
}

/** خط رفعه الأدمن — يظهر في محرّر التصميم مع الخطوط الجاهزة */
export type CustomFontRow = {
  id: string;
  family: string;
  label: string;
  file_url: string;
  format: string;
  weight: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export type EventTag = {
  id: string;
  event_id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export type Guest = {
  id: string;
  event_id: string;
  name: string;
  phone: string | null;
  tag_id: string | null;
  seats: number;
  code: string;
  checked_in_at: string | null;
  checked_in_by: string | null;
  entries_count: number;
  // رقم هذا المدعو في دفتر الحساب المجاني — فارغ في المدفوعة والتجريبية
  free_seq: number | null;
  created_at: string;
}

export type GuestState = Guest & {
  code_state: CodeState;
  owner_id: string;
  event_title: string;
}

export type ScannerAccount = {
  id: string;
  event_id: string;
  username: string;
  display_name: string;
  password_hash: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export type Checkin = {
  id: string;
  event_id: string;
  guest_id: string | null;
  scanner_id: string | null;
  scanner_name: string | null;
  result: CheckinResult;
  is_override: boolean;
  raw_code: string | null;
  note: string | null;
  created_at: string;
}

export type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_halalas: number;
  currency: string;
  billing_period: BillingPeriod;
  events_included: number | null;
  guests_limit: number | null;
  features: string[];
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
}

export type Payment = {
  id: string;
  user_id: string;
  event_id: string | null;
  plan_id: string | null;
  provider: string;
  provider_payment_id: string | null;
  amount_halalas: number;
  currency: string;
  status: 'initiated' | 'paid' | 'failed' | 'refunded';
  raw: Json | null;
  /** كود الخصم المستعمل في هذه الدفعة — إن وُجد */
  discount_code_id: string | null;
  discount_halalas: number;
  created_at: string;
  updated_at: string;
}

export type DiscountKind = 'percent' | 'fixed';

/** كود خصم — ويصير كود مسوّق حين يُملأ اسمه ونسبة عمولته */
export type DiscountCode = {
  id: string;
  code: string;
  label: string | null;
  kind: DiscountKind;
  /** نسبة ١–١٠٠ حين percent، ومبلغ بالهللات حين fixed */
  value: number;
  /** الباقات المشمولة — الفراغ يعني كل الباقات */
  plan_ids: string[];
  max_uses: number | null;
  max_uses_per_user: number;
  used_count: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  marketer_name: string | null;
  commission_percent: number | null;
  created_at: string;
  updated_at: string;
}

/** صفّ لكل استعمال ناجح — القيم منسوخة وقت الاستعمال لا مرجعاً حيّاً */
export type DiscountRedemption = {
  id: string;
  code_id: string;
  user_id: string | null;
  payment_id: string;
  original_halalas: number;
  discount_halalas: number;
  paid_halalas: number;
  commission_halalas: number;
  created_at: string;
}

/** تجميعة تقرير الأكواد والمسوّقين */
export type DiscountCodeStats = {
  id: string;
  code: string;
  label: string | null;
  marketer_name: string | null;
  commission_percent: number | null;
  is_active: boolean;
  used_count: number;
  max_uses: number | null;
  redemptions: number;
  total_discount_halalas: number;
  total_paid_halalas: number;
  total_commission_halalas: number;
  last_used_at: string | null;
}

export type Subscription = {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'canceled' | 'expired';
  current_period_end: string | null;
  provider_ref: string | null;
  /** نهاية الفترة التي أُرسل عنها تذكير التجديد — يمنع تكراره ويسمح به بعد كل تجديد */
  renewal_notice_for: string | null;
  created_at: string;
}

export type SiteContent = {
  key: string;
  page: string;
  label: string | null;
  kind: 'text' | 'richtext' | 'image' | 'list';
  value: unknown;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
}

export type SiteSetting = {
  key: string;
  value: unknown;
  label: string | null;
  updated_at: string;
}

export type TemplateCategory = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
}

export type TemplateRow = {
  id: string;
  category_id: string | null;
  name: string;
  background_url: string;
  thumbnail_url: string | null;
  config: Partial<DesignConfig>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export type GalleryItem = {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  event_type: string | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
}

export type ErrorLog = {
  id: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
  context: Json | null;
  user_id: string | null;
  created_at: string;
}

export type AuditLog = {
  id: string;
  actor_type: 'admin' | 'organizer' | 'scanner' | 'system';
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  meta: Json | null;
  created_at: string;
}

export interface ScanResponse {
  ok: boolean;
  result: CheckinResult;
  state_before?: CodeState;
  message?: string;
  guest?: {
    id: string;
    name: string;
    seats: number;
    checked_in_at: string | null;
    entries_count: number;
    tag: { name: string; color: string } | null;
  };
  stats?: { attended: number; total: number };
}

export interface EventReport {
  event: {
    id: string;
    title: string;
    event_type: EventType;
    starts_at: string;
    venue: string | null;
  };
  totals: { invited: number; attended: number; absent: number };
  by_tag: { tag_name: string; tag_color: string; invited: number; attended: number }[];
  overrides: number;
}

/**
 * شكل مبسّط يكفي لعميل supabase-js دون توليد أنواع كاملة.
 * حقل Relationships مطلوب في عقد GenericTable حتى لو تركناه فارغاً.
 */
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type View<Row> = {
  Row: Row;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<Profile>;
      events: Table<EventRow>;
      event_tags: Table<EventTag>;
      guests: Table<Guest>;
      scanner_accounts: Table<ScannerAccount>;
      checkins: Table<Checkin>;
      guest_deliveries: Table<{
        id: string;
        guest_id: string;
        channel: string;
        status: string;
        provider_ref: string | null;
        error: string | null;
        sent_at: string | null;
        created_at: string;
      }>;
      plans: Table<Plan>;
      payments: Table<Payment>;
      subscriptions: Table<Subscription>;
      site_content: Table<SiteContent>;
      site_settings: Table<SiteSetting>;
      template_categories: Table<TemplateCategory>;
      templates: Table<TemplateRow>;
      gallery_items: Table<GalleryItem>;
      error_logs: Table<ErrorLog>;
      audit_logs: Table<AuditLog>;
      suggestions: Table<Suggestion>;
      custom_fonts: Table<CustomFontRow>;
      reviews: Table<Review>;
      discount_codes: Table<DiscountCode>;
      discount_redemptions: Table<DiscountRedemption>;
    };
    Views: {
      guest_states: View<GuestState>;
      published_reviews: View<PublishedReview>;
      discount_code_stats: View<DiscountCodeStats>;
    };
    Functions: {
      process_scan: {
        Args: { p_scanner_id: string; p_code: string; p_override?: boolean };
        Returns: ScanResponse;
      };
      event_report: { Args: { p_event_id: string }; Returns: EventReport };
      is_super_admin: { Args: Record<string, never>; Returns: boolean };
      /** حجز ذرّي لاستعمال كود خصم — false حين نفد السقف */
      claim_discount_use: { Args: { p_code_id: string }; Returns: boolean };
      has_active_subscription: { Args: { p_user: string }; Returns: boolean };
    };
    Enums: {
      event_status: EventStatus;
      checkin_result: CheckinResult;
    };
    CompositeTypes: Record<string, never>;
  };
}
