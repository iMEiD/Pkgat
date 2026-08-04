import type { Metadata } from 'next';

import { NewEventForm } from './NewEventForm';

export const metadata: Metadata = { title: 'مناسبة جديدة' };

export default function NewEventPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-black text-ink">مناسبة جديدة</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        الخطوة الأولى: بيانات المناسبة. بعدها تختار التصميم وتضيف المدعوين.
      </p>
      <NewEventForm />
    </div>
  );
}
