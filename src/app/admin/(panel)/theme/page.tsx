import type { Metadata } from 'next';

import { ThemeEditor } from './ThemeEditor';
import { AppearancePanel } from '@/components/admin/AppearancePanel';
import { getAppearance, getTheme } from '@/lib/cms';

export const metadata: Metadata = { title: 'الألوان والمظهر' };
export const dynamic = 'force-dynamic';

export default async function AdminThemePage() {
  const [theme, appearance] = await Promise.all([getTheme(), getAppearance()]);

  return (
    <div className="space-y-6">
      <ThemeEditor initial={theme} />
      {/*
        المظهر أسفل الألوان لا فوقها: الألوان قرار هوية يُتخذ مرة،
        والمظهر شيء يُجرَّب ويُطفأ ويُعاد — فمكانه بعد الاستقرار.
      */}
      <AppearancePanel initial={appearance} />
    </div>
  );
}
