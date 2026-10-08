#!/usr/bin/env node
/**
 * فاحص توفّر دومينات .com القصيرة (ثلاثية ورباعية) — بدون أي مكتبة خارجية.
 *
 * الفحص على مرحلتين:
 *   ١) DNS: نسأل عن سجلات NS. وجودها يعني أن الدومين محجوز قطعاً، وهذا
 *      سريع ورخيص فيُصفّي الأغلبية الساحقة من القائمة.
 *   ٢) RDAP (سجلّ Verisign الرسمي لـ .com): لما تبقّى فقط. غياب NS لا يكفي
 *      للحكم بالتوفّر — دومينات محجوزة كثيرة موقوفة (clientHold) أو بلا
 *      خوادم أسماء — فالحكم النهائي من السجلّ: 404 = متاح، 200 = محجوز.
 *
 * التشغيل:
 *   node tools/domain-checker/check.mjs --length 3
 *   node tools/domain-checker/check.mjs --pattern CVCV
 *   node tools/domain-checker/check.mjs --length 4 --charset alnum --limit 5000 --shuffle
 *   node tools/domain-checker/check.mjs --file names.txt
 *
 * انظر README.md بجانب هذا الملف لكل الخيارات.
 */

import { promises as dns } from 'node:dns';
import { readFileSync, existsSync, appendFileSync, writeFileSync } from 'node:fs';

const RDAP = 'https://rdap.verisign.com/com/v1/domain/';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const VOWELS = 'aeiou';
const CONSONANTS = 'bcdfghjklmnpqrstvwxyz';
const DIGITS = '0123456789';

/** رموز النمط: حرف كبير = فئة، وأي حرف صغير أو رقم أو شرطة = نفسه حرفياً */
const CLASSES = {
  L: LETTERS,
  V: VOWELS,
  C: CONSONANTS,
  D: DIGITS,
  A: LETTERS + DIGITS,
  X: LETTERS + DIGITS + '-',
};

const CHARSETS = { letters: 'L', digits: 'D', alnum: 'A', all: 'X' };

// ───────────────────────── الخيارات ─────────────────────────

function parseArgs(argv) {
  const opts = {
    length: null,
    charset: 'letters',
    pattern: null,
    file: null,
    out: 'domains-results.csv',
    limit: Infinity,
    shuffle: false,
    dnsConcurrency: 40,
    rdapConcurrency: 2,
    rdapDelay: 400,
    rdap: true,
    quiet: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) die(`الخيار ${a} يحتاج قيمة`);
      return v;
    };
    switch (a) {
      case '--length': case '-l': opts.length = Number(next()); break;
      case '--charset': case '-c': opts.charset = next(); break;
      case '--pattern': case '-p': opts.pattern = next(); break;
      case '--file': case '-f': opts.file = next(); break;
      case '--out': case '-o': opts.out = next(); break;
      case '--limit': opts.limit = Number(next()); break;
      case '--shuffle': opts.shuffle = true; break;
      case '--dns-concurrency': opts.dnsConcurrency = Number(next()); break;
      case '--rdap-concurrency': opts.rdapConcurrency = Number(next()); break;
      case '--rdap-delay': opts.rdapDelay = Number(next()); break;
      case '--no-rdap': opts.rdap = false; break;
      case '--quiet': case '-q': opts.quiet = true; break;
      case '--help': case '-h': usage(); process.exit(0);
      default: die(`خيار غير معروف: ${a}`);
    }
  }
  if (!opts.pattern && !opts.file && !opts.length) opts.length = 3;
  if (opts.length && ![3, 4].includes(opts.length)) {
    console.warn(`تنبيه: الطول ${opts.length} — الأداة مصمّمة للثلاثي والرباعي، والعدد قد يكون ضخماً.`);
  }
  if (!CHARSETS[opts.charset]) die(`charset غير معروف: ${opts.charset} (المتاح: ${Object.keys(CHARSETS).join(', ')})`);
  return opts;
}

function usage() {
  console.log(`فاحص توفّر دومينات .com القصيرة

  --length, -l <3|4>        طول الاسم (الافتراضي 3)
  --charset, -c <name>      letters | digits | alnum | all  (all تشمل الشرطة)
  --pattern, -p <pattern>   نمط بدل الطول: L حرف، V حرف علة، C ساكن، D رقم،
                            A حرف/رقم، X حرف/رقم/شرطة، وغيرها حرفي.
                            أمثلة: CVCV  |  LLLD  |  ai**  ← * = فئة charset
  --file, -f <path>         افحص أسماء من ملف (اسم في كل سطر)
  --out, -o <path>          ملف النتائج CSV (الافتراضي domains-results.csv)
                            يُستأنف منه تلقائياً: ما فُحص سابقاً لا يُعاد
  --limit <n>               أقصى عدد يُفحص في هذه الجولة
  --shuffle                 ترتيب عشوائي (مفيد مع --limit)
  --dns-concurrency <n>     طلبات DNS المتوازية (40)
  --rdap-concurrency <n>    طلبات RDAP المتوازية (2)
  --rdap-delay <ms>         مهلة بين طلبات RDAP لكل عامل (400)
  --no-rdap                 DNS فقط — النتيجة "محتمل" لا "مؤكد"
  --quiet, -q               لا تطبع إلا المتاح`);
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

// ───────────────────────── توليد الأسماء ─────────────────────────

function patternToSlots(pattern, charset) {
  const any = CLASSES[CHARSETS[charset]];
  return [...pattern].map((ch) => {
    if (ch === '*') return any;
    if (CLASSES[ch]) return CLASSES[ch];
    if (/[a-z0-9-]/.test(ch)) return ch;
    die(`رمز غير صالح في النمط: "${ch}"`);
  });
}

function* product(slots, i = 0, prefix = '') {
  if (i === slots.length) { yield prefix; return; }
  for (const ch of slots[i]) yield* product(slots, i + 1, prefix + ch);
}

/** قواعد .com: حروف/أرقام/شرطة، لا شرطة في البداية أو النهاية، ولا "--" في الموضع 3-4 */
function isValidLabel(name) {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name) && name.slice(2, 4) !== '--';
}

function buildCandidates(opts) {
  let names;
  if (opts.file) {
    names = readFileSync(opts.file, 'utf8')
      .split(/\r?\n/)
      .map((s) => s.trim().toLowerCase().replace(/\.com$/, ''))
      .filter(Boolean);
  } else {
    const pattern = opts.pattern ?? '*'.repeat(opts.length);
    names = [...product(patternToSlots(pattern, opts.charset))];
  }
  names = [...new Set(names)].filter(isValidLabel);
  if (opts.shuffle) {
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
  }
  return names;
}

// ───────────────────────── الفحص ─────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 'taken' إن وُجدت NS، 'nxdomain' إن لم يكن في المنطقة، وإلا 'unknown' */
async function dnsCheck(domain) {
  try {
    const ns = await dns.resolveNs(domain);
    return ns.length ? 'taken' : 'unknown';
  } catch (e) {
    if (e.code === 'ENOTFOUND') return 'nxdomain';
    return 'unknown'; // ENODATA, SERVFAIL, مهلة… نترك الحكم لـ RDAP
  }
}

/** يعيد { status: 'available'|'taken'|'error', detail } */
async function rdapCheck(domain) {
  for (let attempt = 0; attempt < 6; attempt++) {
    let res;
    try {
      res = await fetch(RDAP + domain, {
        headers: { accept: 'application/rdap+json' },
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.status === 404) return { status: 'available', detail: '' };
    if (res.status === 200) {
      const body = await res.json().catch(() => ({}));
      const st = (body.status ?? []).join('|');
      const exp = (body.events ?? []).find((e) => e.eventAction === 'expiration')?.eventDate ?? '';
      return { status: 'taken', detail: [st, exp && `expires ${exp.slice(0, 10)}`].filter(Boolean).join(' ; ') };
    }
    if (res.status === 429 || res.status >= 500) {
      const retry = Number(res.headers.get('retry-after'));
      await sleep(retry > 0 ? retry * 1000 : 2000 * 2 ** attempt);
      continue;
    }
    return { status: 'error', detail: `HTTP ${res.status}` };
  }
  return { status: 'error', detail: 'تعذّر الوصول لـ RDAP بعد عدة محاولات' };
}

/** يشغّل fn على العناصر بعدد عمّال ثابت */
async function pool(items, concurrency, fn) {
  let i = 0;
  const worker = async () => {
    while (i < items.length) await fn(items[i++]);
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
}

// ───────────────────────── التشغيل ─────────────────────────

function loadDone(out) {
  const done = new Set();
  if (!existsSync(out)) {
    writeFileSync(out, 'domain,status,detail,checked_at\n');
    return done;
  }
  for (const line of readFileSync(out, 'utf8').split('\n').slice(1)) {
    const [domain, status] = line.split(',');
    // الأخطاء تُعاد في الجولة التالية
    if (domain && status && status !== 'error') done.add(domain);
  }
  return done;
}

const csv = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

async function main() {
  const opts = parseArgs(process.argv);
  const done = loadDone(opts.out);
  const all = buildCandidates(opts).map((n) => `${n}.com`);
  const queue = all.filter((d) => !done.has(d)).slice(0, opts.limit);

  const skipped = all.filter((d) => done.has(d)).length;
  console.log(`المرشّحون: ${all.length} — فُحص سابقاً: ${skipped} — في هذه الجولة: ${queue.length}`);
  if (!queue.length) return;

  const stats = { taken: 0, available: 0, likely: 0, error: 0 };
  const record = (domain, status, detail = '') => {
    stats[status === 'likely-available' ? 'likely' : status]++;
    appendFileSync(opts.out, [domain, status, csv(detail), new Date().toISOString()].join(',') + '\n');
    if (status === 'available') console.log(`✅ متاح: ${domain}`);
    else if (status === 'likely-available') console.log(`🟡 محتمل (DNS فقط): ${domain}`);
    else if (!opts.quiet && status === 'error') console.log(`⚠️  ${domain}: ${detail}`);
  };

  // المرحلة ١: DNS
  const toRdap = [];
  let n = 0;
  const t0 = Date.now();
  await pool(queue, opts.dnsConcurrency, async (domain) => {
    const r = await dnsCheck(domain);
    if (r === 'taken') record(domain, 'taken', 'has NS');
    else if (opts.rdap) toRdap.push(domain);
    else record(domain, r === 'nxdomain' ? 'likely-available' : 'error', r === 'nxdomain' ? 'no NS' : 'dns unknown');
    if (!opts.quiet && ++n % 500 === 0) {
      process.stdout.write(`  DNS: ${n}/${queue.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
    }
  });

  // المرحلة ٢: RDAP — بطيئة عمداً احتراماً لحدود Verisign
  if (opts.rdap && toRdap.length) {
    console.log(`بلا NS: ${toRdap.length} — تأكيدها من سجلّ Verisign…`);
    await pool(toRdap, opts.rdapConcurrency, async (domain) => {
      const r = await rdapCheck(domain);
      record(domain, r.status, r.detail);
      await sleep(opts.rdapDelay);
    });
  }

  console.log(
    `\nانتهى: محجوز ${stats.taken} · متاح ${stats.available}` +
      (stats.likely ? ` · محتمل ${stats.likely}` : '') +
      (stats.error ? ` · أخطاء ${stats.error} (تُعاد في الجولة القادمة)` : '') +
      `\nالنتائج في: ${opts.out}`,
  );
}

main().catch((e) => die(e.stack ?? String(e)));
