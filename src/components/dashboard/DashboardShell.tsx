'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { Logo } from '@/components/ui/Logo';
import { Icon } from '@/components/ui/Icon';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { cn } from '@/lib/utils/cn';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
}

export function DashboardShell({
  nav,
  userName,
  isAdmin,
  contextTitle,
  contextHref,
  children,
}: {
  nav: NavItem[];
  userName: string;
  isAdmin: boolean;
  contextTitle?: string;
  contextHref?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <div className="min-h-screen">
      <header className="pk-chrome sticky top-0 z-40 border-b border-sand-200 bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo href="/dashboard" showTagline={false} />

          {contextTitle && (
            <div className="hidden min-w-0 items-center gap-2 border-r border-sand-200 pr-4 md:flex">
              <span className="text-ink-faint">/</span>
              {contextHref ? (
                <Link
                  href={contextHref}
                  className="truncate text-sm font-bold text-ink transition-colors hover:text-grape-600"
                >
                  {contextTitle}
                </Link>
              ) : (
                <span className="truncate text-sm font-bold text-ink">{contextTitle}</span>
              )}
            </div>
          )}

          <div className="flex-1" />

          <div className="hidden items-center gap-2 sm:flex">
            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-full bg-ink px-3.5 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-85"
              >
                لوحة الأدمن
              </Link>
            )}
            <span className="max-w-[160px] truncate text-sm font-semibold text-ink-soft">
              {userName}
            </span>
            <ThemeToggle className="h-9 w-9" />
            <form action="/api/auth/signout" method="post">
              <button
                type="submit"
                className="grid h-9 w-9 place-items-center rounded-full text-ink-faint transition-colors hover:bg-sand-100 hover:text-coral-600"
                aria-label="تسجيل الخروج"
              >
                <Icon name="logout" />
              </button>
            </form>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-full p-2 text-ink transition-colors hover:bg-sand-100 lg:hidden"
            aria-label="القائمة"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>

        {menuOpen && (
          <nav className="border-t border-sand-200 bg-canvas px-4 py-3 lg:hidden">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors',
                  isActive(item) ? 'bg-grape-50 text-grape-600' : 'text-ink-soft hover:bg-sand-100',
                )}
              >
                <Icon name={item.icon} className="h-4.5 w-4.5" />
                {item.label}
              </Link>
            ))}
            <form action="/api/auth/signout" method="post" className="mt-2">
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-coral-600 transition-colors hover:bg-coral-50"
              >
                <Icon name="logout" className="h-4.5 w-4.5" />
                تسجيل الخروج
              </button>
            </form>
          </nav>
        )}
      </header>

      <div className="pk-shell mx-auto flex max-w-7xl gap-8 px-4 py-8 sm:px-6">
        <aside className="pk-chrome hidden w-56 shrink-0 lg:block">
          <nav className="sticky top-[92px] space-y-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all duration-200',
                  isActive(item)
                    ? 'bg-grape-500 text-white shadow-pop'
                    : 'text-ink-soft hover:bg-sand-100 hover:text-ink',
                )}
              >
                <Icon name={item.icon} className="h-4.5 w-4.5" />
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 animate-fade-in">{children}</main>
      </div>
    </div>
  );
}
