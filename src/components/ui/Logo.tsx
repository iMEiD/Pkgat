import Link from 'next/link';

import { cn } from '@/lib/utils/cn';

/**
 * شعار بكجات: إطار مسح — أربع زوايا تحيط بمربع.
 *
 * الشكل نفسه الذي تراه في كاميرا أي قارئ باركود، فيُفهم بلا شرح ويصف
 * المنتج حرفياً: إطارٌ تمسح فيه.
 *
 * ولا صندوق حوله: العلامة وحدها أهدأ وأقرب لروح الهوية، والصندوق
 * يبقى للأيقونة (public/icon.svg) حيث يلزم سطحٌ يفصلها عن شريط
 * المتصفح.
 *
 * ومركزها مفرَّغ هنا ومصمت في الأيقونة: قيس الاثنان على ١٦ بكسل،
 * فالفراغ يذوب في ذلك المقاس والمصمت يبقى. وحلٌّ واحد للمقاسين
 * يخسر أحدهما دائماً.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-10 w-10 shrink-0 text-grape-500', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* أربع زوايا تحيط بفراغ — إطار المسح كما تراه في أي كاميرا */}
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      {/* المربع الممسوح في المنتصف */}
      <rect x="9.2" y="9.2" width="5.6" height="5.6" rx="1.4" />
    </svg>
  );
}

export function Logo({
  href = '/',
  className,
  showTagline = true,
}: {
  href?: string;
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn('group inline-flex items-center gap-2.5 transition-opacity hover:opacity-90', className)}
    >
      <LogoMark className="transition-transform duration-300 group-hover:rotate-[-6deg]" />
      {/*
        العربي هو الاسم، والإنجليزي سطر مساند تحته.

        كان معكوساً: PKGAT كبيراً و«بكجات» صغيراً. والموقع عربي وزوّاره
        عرب، فاسمُه الذي يُقرأ ويُنطق ويُبحث به هو العربي — واللاتيني
        يخدم النطق للأجنبي ولا يُقدَّم عليه.
      */}
      <span className="flex flex-col leading-none">
        <span className="font-display text-xl font-bold text-ink sm:text-[22px]">بكجات</span>
        {showTagline && (
          <span
            className="mt-1 text-[10px] font-semibold tracking-[0.16em] text-ink-faint"
            dir="ltr"
          >
            PKGAT
          </span>
        )}
      </span>
    </Link>
  );
}
