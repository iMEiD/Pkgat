import type { Config } from 'tailwindcss';

/**
 * نظام تصميم بكجات (PKGAT Design System)
 * الأساس: أبيض وبيج هادئ. اللمسات: ألوان حيوية مرحة تُستخدم في الأزرار
 * والعناصر التفاعلية والقوالب فقط — وليست خلفية طاغية.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        /*
         * القاعدة الهادئة واللون الأساسي يُقرآن من متغيرات CSS، فيقدر
         * الأدمن يغيّر هوية الموقع من لوحته بدون إعادة بناء. القيم
         * الافتراضية معرَّفة في globals.css ويستبدلها الخادم بما هو
         * محفوظ في قاعدة البيانات.
         */
        canvas: 'rgb(var(--pk-canvas) / <alpha-value>)',
        // أسطح البطاقات والحقول — أبيض في الوضع الفاتح، رمادي داكن في الليلي
        surface: 'rgb(var(--pk-surface) / <alpha-value>)',
        sand: {
          50: 'rgb(var(--pk-sand-50) / <alpha-value>)',
          100: 'rgb(var(--pk-sand-100) / <alpha-value>)',
          200: 'rgb(var(--pk-sand-200) / <alpha-value>)',
          300: 'rgb(var(--pk-sand-300) / <alpha-value>)',
          400: 'rgb(var(--pk-sand-400) / <alpha-value>)',
          500: 'rgb(var(--pk-sand-500) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--pk-ink) / <alpha-value>)',
          soft: 'rgb(var(--pk-ink-soft) / <alpha-value>)',
          faint: 'rgb(var(--pk-ink-faint) / <alpha-value>)',
        },
        // اللون الأساسي (قابل للتغيير من لوحة الأدمن)
        grape: {
          50: 'rgb(var(--pk-primary-50) / <alpha-value>)',
          100: 'rgb(var(--pk-primary-100) / <alpha-value>)',
          200: 'rgb(var(--pk-primary-200) / <alpha-value>)',
          300: 'rgb(var(--pk-primary-300) / <alpha-value>)',
          400: 'rgb(var(--pk-primary-400) / <alpha-value>)',
          500: 'rgb(var(--pk-primary-500) / <alpha-value>)',
          600: 'rgb(var(--pk-primary-600) / <alpha-value>)',
          700: 'rgb(var(--pk-primary-700) / <alpha-value>)',
        },
        coral: {
          50: '#FFF0EC',
          100: '#FFDFD6',
          300: '#FFA893',
          500: '#FF6B4A',
          600: '#E9502E',
          /* للنص على خلفية coral-50 — درجة ٦٠٠ تعطي ٣٫٤ فقط مقابل ٤٫٥ */
          700: '#B03B1A',
        },
        mint: {
          50: '#E9FBF6',
          100: '#CFF5EA',
          300: '#7FE0C6',
          500: '#17BE94',
          600: '#0E9A78',
        },
        sunny: {
          50: '#FFF7E4',
          100: '#FFEDC2',
          300: '#FFD467',
          500: '#F5B01B',
          600: '#D3910A',
        },
        sky: {
          50: '#EAF4FF',
          100: '#CFE6FF',
          300: '#84BFFF',
          500: '#2E90FA',
          600: '#1265B8',
        },
        rose: {
          50: '#FFEFF5',
          100: '#FFD9E7',
          300: '#FF9BC1',
          500: '#F0518B',
          600: '#CE3670',
        },
      },
      fontFamily: {
        // المصدر الحقيقي للقيم هو متغيّرا CSS في globals.css
        sans: ['var(--font-ui)', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'El Messiri', 'system-ui', 'sans-serif'],
      },
      fontWeight: {
        /*
         * خطا الواجهة (El Messiri وIBM Plex Sans Arabic) يتوقفان عند ٧٠٠.
         * طلب وزن أثقل يجعل المتصفح يزوّر السُمك (faux bold) بنتيجة مشوّهة،
         * لذلك نقصر الأدوات على الأوزان المتاحة فعلاً.
         */
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      spacing: {
        // نصف خطوة يستخدمها نظام التصميم للأيقونات؛ غير موجودة في سلّم
        // Tailwind الافتراضي، فبدونها تصبح h-4.5 صنفاً بلا CSS والأيقونة بلا مقاس
        '4.5': '1.125rem',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
        '4xl': '2.25rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(42,37,33,0.04), 0 8px 24px -12px rgba(42,37,33,0.16)',
        lift: '0 2px 4px rgba(42,37,33,0.05), 0 18px 40px -16px rgba(42,37,33,0.24)',
        pop: '0 10px 30px -10px rgb(var(--pk-primary-500) / 0.45)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.94)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(-200%)' },
        },
        /*
         * نزول القائمة: تنفتح من أعلاها لا تظهر دفعة واحدة.
         *
         * scaleY وحده يمطّ النص رأسياً وهو قبيح، فنُبقي المحتوى ثابتاً
         * ونحرّك اللوح: انزلاق قصير مع تلاشٍ. والمنحنى يخرج سريعاً
         * ويستقر ببطء (ease-out) — فتُحسّ القائمة خفيفة لا ثقيلة.
         */
        'menu-in': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        /* تتابع العناصر: كل سطر يلحق سابقه بفارق يسير */
        'menu-item-in': {
          '0%': { opacity: '0', transform: 'translateY(-6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .6s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fade-in .5s ease both',
        'pop-in': 'pop-in .35s cubic-bezier(.22,1,.36,1) both',
        float: 'float 6s ease-in-out infinite',
        'menu-in': 'menu-in .26s cubic-bezier(.22,1,.36,1) both',
        'menu-item-in': 'menu-item-in .3s cubic-bezier(.22,1,.36,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
