import { DashboardShell, type NavItem } from '@/components/dashboard/DashboardShell';
import { requireAdmin } from '@/lib/auth/session';

const NAV: NavItem[] = [
  { href: '/admin', label: 'نظرة عامة', icon: 'chart', exact: true },
  { href: '/admin/events', label: 'المناسبات', icon: 'calendar' },
  { href: '/admin/users', label: 'المستخدمون', icon: 'users' },
  { href: '/admin/content', label: 'محتوى الموقع', icon: 'edit' },
  { href: '/admin/templates', label: 'القوالب الجاهزة', icon: 'palette' },
  { href: '/admin/gallery', label: 'معرض الأعمال', icon: 'sparkle' },
  { href: '/admin/plans', label: 'الباقات والأسعار', icon: 'settings' },
  { href: '/admin/logs', label: 'السجلات', icon: 'shield' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <DashboardShell
      nav={NAV}
      userName={session.profile.full_name || session.email}
      isAdmin={false}
      contextTitle="لوحة الأدمن"
      contextHref="/admin"
    >
      {children}
    </DashboardShell>
  );
}
