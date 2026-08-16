'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Logo } from '@/components/ui/Logo';
import { ButtonLink } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { SurfaceToggle } from '@/components/ui/SurfaceToggle';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils/cn';

const NAV = [
  { href: '/', label: 'الرئيسية' },
  { href: '/gallery', label: 'أعمالنا' },
  { href: '/pricing', label: 'الأسعار' },
  { href: '/about', label: 'من نحن' },
];

export function SiteHeader({
  signedIn,
  showGallery,
}: {
  signedIn: boolean;
  /** صفحة «أعمالنا» مطفأة من لوحة الأدمن — فلا رابط لها */
  showGallery: boolean;
}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const nav = showGallery ? NAV : NAV.filter((i) => i.href !== '/gallery');

  return (
    <header
      className={cn(
        'pk-bar sticky top-0 z-40 transition-all duration-300',
        scrolled
          ? 'pk-bar-on border-b border-sand-200 bg-canvas/85 backdrop-blur-md shadow-soft'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      {/*
        pk-bar-inner: في الشكل الزجاجي يصير هذا الغلاف لوحاً عائماً
        بحوافّ مستديرة (كما في المراجع)، وتتخلّى الترويسة نفسها عن
        خلفيتها وحدّها. وفي الكلاسيكي لا أثر له إطلاقاً.
      */}
      <div className="pk-bar-inner pk-container flex h-[72px] items-center justify-between gap-4">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                  active ? 'text-grape-600' : 'text-ink-soft hover:bg-sand-100 hover:text-ink',
                )}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-4 -bottom-0.5 h-0.5 rounded-full bg-grape-500" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {/*
            حسابات التواصل نزلت للذيل وحدها.

            موضعها في الترويسة يزاحم زر «ابدأ مجاناً» على انتباه الزائر،
            ويخرجه من الموقع قبل أن يفهمه. ومن أراد الحساب وجده أسفل
            الصفحة حيث يبحث عنه أصلاً.
          */}
          <SurfaceToggle />
          <ThemeToggle />
          {signedIn ? (
            <ButtonLink href="/dashboard" size="sm">
              لوحتي
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                دخول
              </ButtonLink>
              <ButtonLink href="/signup" size="sm">
                ابدأ مجاناً
              </ButtonLink>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <SurfaceToggle />
          <ThemeToggle />
          <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="القائمة"
          aria-expanded={open}
          className="rounded-full p-2 text-ink transition-colors hover:bg-sand-100"
        >
          <svg viewBox="0 0 24 24" className="pk-burger h-6 w-6" data-open={open} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
          </button>
        </div>
      </div>

      {/*
        القائمة كانت ٩٥٪ عتامة — أي مصمتة عملياً. وخطّاف pk-panel-menu
        يجعلها لوحاً شفافاً تبين الصفحة خلفه في الشكل الزجاجي، ويتركها
        كما هي في الكلاسيكي.
      */}
      {open && (
        <div className="pk-panel-menu animate-menu-in border-t border-sand-200 bg-canvas/95 backdrop-blur-md md:hidden">
          <nav className="pk-menu-stagger pk-container flex flex-col gap-1 py-4">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-2xl px-4 py-3 text-sm font-semibold transition-colors',
                  pathname === item.href
                    ? 'bg-grape-50 text-grape-600'
                    : 'text-ink-soft hover:bg-sand-100',
                )}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex gap-2">
              {signedIn ? (
                <ButtonLink href="/dashboard" fullWidth>
                  لوحتي
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink href="/login" variant="secondary" fullWidth>
                    دخول
                  </ButtonLink>
                  <ButtonLink href="/signup" fullWidth>
                    ابدأ مجاناً
                  </ButtonLink>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
