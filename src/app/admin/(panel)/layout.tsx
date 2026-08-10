import { redirect } from 'next/navigation';

import { DashboardShell, type NavItem } from '@/components/dashboard/DashboardShell';
import { SetupRequired } from '@/components/SetupRequired';
import { requireAdmin, requireUser } from '@/lib/auth/session';
import { checkAdminEnv } from '@/lib/config';

const NAV: NavItem[] = [
  { href: '/admin', label: 'نظرة عامة', icon: 'chart', exact: true },
  { href: '/admin/events', label: 'المناسبات', icon: 'calendar' },
  { href: '/admin/users', label: 'المستخدمون', icon: 'users' },
  { href: '/admin/content', label: 'محتوى الموقع', icon: 'edit' },
  { href: '/admin/theme', label: 'الألوان والهوية', icon: 'palette' },
  { href: '/admin/templates', label: 'القوالب الجاهزة', icon: 'sparkle' },
  { href: '/admin/fonts', label: 'الخطوط', icon: 'edit' },
  { href: '/admin/gallery', label: 'معرض الأعمال', icon: 'upload' },
  { href: '/admin/plans', label: 'الباقات والأسعار', icon: 'settings' },
  { href: '/admin/reviews', label: 'التقييمات', icon: 'star' },
  { href: '/admin/suggestions', label: 'الاقتراحات', icon: 'edit' },
  { href: '/admin/logs', label: 'السجلات', icon: 'shield' },
  { href: '/admin/health', label: 'فحص قاعدة البيانات', icon: 'pulse' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // نتحقق من الهوية أولاً حتى لا تُكشف تفاصيل إعداد الخادم لغير الأدمن،
  // ثم نفحص الإعداد قبل أي استدعاء يعتمد على مفتاح الخدمة — فالنقص يظهر
  // كصفحة عربية واضحة بدل انهيار «Application error».
  const user = await requireUser('/admin');
  if (!user.profile.is_super_admin) redirect('/dashboard');

  const problems = checkAdminEnv();
  if (problems.length > 0) {
    return <SetupRequired title="لوحة الأدمن تحتاج إعداداً" problems={problems} />;
  }

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
