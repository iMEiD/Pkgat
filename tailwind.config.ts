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
        // القاعدة الهادئة
        canvas: '#FFFDF9',
        sand: {
          50: '#FDFAF4',
          100: '#F9F3E9',
          200: '#F2E9D9',
          300: '#E7DAC3',
          400: '#D8C6A8',
          500: '#C2AC88',
        },
        ink: {
          DEFAULT: '#2A2521',
          soft: '#5C544B',
          faint: '#8C8377',
        },
        // اللمسات الحيوية
        grape: {
          50: '#F2EEFF',
          100: '#E3DBFF',
          200: '#C7B8FF',
          300: '#A48EFF',
          400: '#8468FF',
          500: '#6D4AFF',
          600: '#5A34E8',
          700: '#4726B8',
        },
        coral: {
          50: '#FFF0EC',
          100: '#FFDFD6',
          300: '#FFA893',
          500: '#FF6B4A',
          600: '#E9502E',
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
          600: '#1570CD',
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
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
        '4xl': '2.25rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(42,37,33,0.04), 0 8px 24px -12px rgba(42,37,33,0.16)',
        lift: '0 2px 4px rgba(42,37,33,0.05), 0 18px 40px -16px rgba(42,37,33,0.24)',
        pop: '0 10px 30px -10px rgba(109,74,255,0.45)',
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
      },
      animation: {
        'fade-up': 'fade-up .6s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fade-in .5s ease both',
        'pop-in': 'pop-in .35s cubic-bezier(.22,1,.36,1) both',
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
