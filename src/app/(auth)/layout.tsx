import Link from 'next/link';

import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="pk-dots absolute inset-0 -z-10 opacity-50" aria-hidden="true" />

      <header className="pk-container flex h-[72px] items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/" className="pk-tap text-sm font-semibold text-ink-soft transition-colors hover:text-grape-600">
            ← العودة للموقع
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md animate-fade-up">{children}</div>
      </main>

      <footer className="pk-container py-6 text-center text-xs text-ink-faint">
        بكجات — دعوات إلكترونية بباركود دخول
      </footer>
    </div>
  );
}
