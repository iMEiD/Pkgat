'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils/cn';

export function EventTabs({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/events/${eventId}`;

  const tabs = [
    { href: base, label: 'نظرة عامة', icon: 'chart', exact: true },
    { href: `${base}/design`, label: 'التصميم', icon: 'palette' },
    { href: `${base}/guests`, label: 'المدعوون', icon: 'users' },
    { href: `${base}/scanners`, label: 'مسؤولو المسح', icon: 'scan' },
    { href: `${base}/live`, label: 'السجل المباشر', icon: 'shield' },
    { href: `${base}/report`, label: 'التقرير', icon: 'download' },
    { href: `${base}/settings`, label: 'الإعدادات', icon: 'settings' },
  ];

  return (
    <div className="-mx-4 mb-6 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 pk-scrollbar">
      <nav className="flex min-w-max gap-1 rounded-2xl border border-sand-200 bg-white/70 p-1.5">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200',
                active
                  ? 'bg-grape-500 text-white shadow-pop'
                  : 'text-ink-soft hover:bg-sand-100 hover:text-ink',
              )}
            >
              <Icon name={tab.icon} className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
