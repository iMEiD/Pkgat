import Link from 'next/link';

import { cn } from '@/lib/utils/cn';

/**
 * الشعار النصي (Logotype) لبكجات.
 * علامة QR مبسّطة + الاسم بالإنجليزي كشعار رئيسي والعربي كسطر مساند.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-grape-500 text-white shadow-pop',
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
        <path d="M3 3h7v7H3V3Zm2 2v3h3V5H5Z" />
        <path d="M14 3h7v7h-7V3Zm2 2v3h3V5h-3Z" />
        <path d="M3 14h7v7H3v-7Zm2 2v3h3v-3H5Z" />
        <path d="M14 14h3v3h-3v-3Zm5 0h2v2h-2v-2Zm-5 5h3v2h-3v-2Zm5 1h2v1h-2v-1Zm-2-1h2v2h-2v-2Z" />
      </svg>
    </span>
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
      <span className="flex flex-col leading-none">
        <span className="font-display text-xl font-bold tracking-[0.14em] text-ink" dir="ltr">
          PKGAT
        </span>
        {showTagline && (
          <span className="mt-1 text-[11px] font-semibold text-ink-faint">بكجات</span>
        )}
      </span>
    </Link>
  );
}
