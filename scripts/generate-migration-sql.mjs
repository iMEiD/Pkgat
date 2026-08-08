/**
 * يولّد src/lib/migration-sql.ts من ملفات supabase/migrations.
 *
 * لماذا نُضمّن نص SQL في الكود بدل قراءته من القرص وقت التشغيل؟
 * لأن صفحة فحص قاعدة البيانات تعرض الكود الناقص جاهزاً للنسخ من
 * الجوال — والمستودع خاص، فروابط GitHub تعطي 404 لصاحب المنصة.
 * قراءة الملفات وقت التشغيل على Vercel تعتمد على تتبّع الملفات في
 * الحزمة، وفشلها صامت. التضمين وقت البناء لا يفشل.
 *
 * التشغيل بعد إضافة أو تعديل أي ترحيل:  node scripts/generate-migration-sql.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const OUTPUT = join(process.cwd(), 'src', 'lib', 'migration-sql.ts');

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

/** نص جاهز للوضع داخل قالب نصّي في TypeScript */
function escapeForTemplate(sql) {
  return sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

const entries = files
  .map((file) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').trimEnd();
    return `  '${file}': \`${escapeForTemplate(sql)}\`,`;
  })
  .join('\n');

const output = `/**
 * نصوص الترحيلات كما هي في supabase/migrations.
 *
 * ⚠️ ملف مولّد — لا يُحرَّر يدوياً.
 * أعد توليده بعد أي تعديل على الترحيلات:
 *   node scripts/generate-migration-sql.mjs
 */

export const MIGRATION_SQL: Record<string, string> = {
${entries}
};

/** نص ترحيل بعينه، أو null إن لم يكن مضمّناً */
export function migrationSql(file: string): string | null {
  return MIGRATION_SQL[file] ?? null;
}
`;

writeFileSync(OUTPUT, output, 'utf8');
console.log(`تم توليد ${OUTPUT} من ${files.length} ترحيلاً.`);
