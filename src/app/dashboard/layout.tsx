import { DashboardShell, type NavItem } from '@/components/dashboard/DashboardShell';
import { requireUser } from '@/lib/auth/session';

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'مناسباتي', icon: 'calendar', exact: true },
  { href: '/dashboard/billing', label: 'الاشتراك والدفع', icon: 'sparkle' },
  { href: '/dashboard/settings', label: 'إعدادات الحساب', icon: 'settings' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser('/dashboard');

  return (
    <DashboardShell
      nav={NAV}
      userName={session.profile.full_name || session.email}
      isAdmin={session.profile.is_super_admin}
    >
      {children}
    </DashboardShell>
  );
}
