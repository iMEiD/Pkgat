import type { Metadata } from 'next';

import { ThemeEditor } from './ThemeEditor';
import { getTheme } from '@/lib/cms';

export const metadata: Metadata = { title: 'الألوان والهوية' };
export const dynamic = 'force-dynamic';

export default async function AdminThemePage() {
  const theme = await getTheme();
  return <ThemeEditor initial={theme} />;
}
