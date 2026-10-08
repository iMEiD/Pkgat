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
const WORDS_FILE = new URL('./words.txt', import.meta.url);

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
    txt: 'available.txt',
    words: false,
    all: false,
    limit: Infinity,
    shuffle: false,
    dnsConcurrency: 40,
    rdapConcurrency: 2,
    rdapDelay: 400,
    rdap: true,
    quiet: false,
    repeated: false,
    shape: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) die(`Option ${a} needs a value`);
      return v;
    };
    switch (a) {
      case '--length': case '-l': opts.length = Number(next()); break;
      case '--charset': case '-c': opts.charset = next(); break;
      case '--pattern': case '-p': opts.pattern = next(); break;
      case '--shape': case '-s': opts.shape = next(); break;
      case '--repeated': case '-r': opts.repeated = true; break;
      case '--words': case '-w': opts.words = true; break;
      case '--all': case '-a': opts.all = true; break;
      case '--txt': case '-t': opts.txt = next(); break;
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
      default: die(`Unknown option: ${a} (see --help)`);
    }
  }
  // بلا مصدر محدد = البحث الشامل
  if (!opts.pattern && !opts.file && !opts.shape && !opts.length && !opts.words) opts.all = true;
  if (opts.length && ![3, 4].includes(opts.length)) {
    console.warn(`Warning: length ${opts.length} — this tool is meant for 3 and 4 characters; the list may be huge.`);
  }
  if (!CHARSETS[opts.charset]) die(`Unknown charset: ${opts.charset} (use: ${Object.keys(CHARSETS).join(', ')})`);
  return opts;
}

function usage() {
  console.log(`Short .com domain availability checker

  (no options)              same as --all
  --all, -a                 everything in one run: meaningful words (3-4 letters),
                            then all 4-letter names with a repeated letter,
                            then all 3-letter names (letters only)
  --words, -w               common English words of 3-4 letters (words.txt)
  --length, -l <3|4>        name length
  --charset, -c <name>      letters | digits | alnum | all  (all includes hyphen)
  --repeated, -r            only names where some character appears twice or more
                            (e.g. aabc, abca, aaaa)
  --shape, -s <shape>       repetition shape: same letter = same character,
                            different letters = different characters.
                            e.g. aabb (ccdd) | abab (titi) | abba (otto) | aaaa
  --pattern, -p <pattern>   per-position pattern: L letter, V vowel, C consonant,
                            D digit, A letter/digit, X letter/digit/hyphen,
                            * = --charset, anything else is literal.
                            e.g. CVCV | LLLD | ai**
  --file, -f <path>         check names from a file (one per line)
  --txt, -t <path>          available domains, one per line (default available.txt)
  --out, -o <path>          results CSV (default domains-results.csv).
                            Re-running resumes: checked names are skipped.
  --limit <n>               max names to check this run
  --shuffle                 random order (useful with --limit)
  --dns-concurrency <n>     parallel DNS lookups (40)
  --rdap-concurrency <n>    parallel RDAP requests (2)
  --rdap-delay <ms>         pause between RDAP requests per worker (400)
  --no-rdap                 DNS only: results are "likely", not confirmed
  --quiet, -q               print available domains only`);
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
    die(`Invalid pattern character: "${ch}"`);
  });
}

function* product(slots, i = 0, prefix = '') {
  if (i === slots.length) { yield prefix; return; }
  for (const ch of slots[i]) yield* product(slots, i + 1, prefix + ch);
}

/** الشكل: الحرف نفسه في الشكل = الحرف نفسه في الاسم، والمختلف = مختلف (aabb → ccdd) */
function* fromShape(shape, chars, i = 0, map = new Map(), prefix = '') {
  if (i === shape.length) { yield prefix; return; }
  const sym = shape[i];
  if (map.has(sym)) { yield* fromShape(shape, chars, i + 1, map, prefix + map.get(sym)); return; }
  const used = new Set(map.values());
  for (const ch of chars) {
    if (used.has(ch)) continue;
    map.set(sym, ch);
    yield* fromShape(shape, chars, i + 1, map, prefix + ch);
    map.delete(sym);
  }
}

/** قواعد .com: حروف/أرقام/شرطة، لا شرطة في البداية أو النهاية، ولا "--" في الموضع 3-4 */
function isValidLabel(name) {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name) && name.slice(2, 4) !== '--';
}

/** أسماء من ملف: اسم في كل سطر، والأسطر التي تبدأ بـ # تعليقات */
function readList(path) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim().toLowerCase().replace(/\.com$/, ''))
    .filter((s) => s && !s.startsWith('#'));
}

const hasRepeat = (n) => new Set(n).size < n.length;

function buildCandidates(opts) {
  // المصادر تُجمع بالترتيب: الأثمن أولاً، والتكرار يُحذف
  const lists = [];
  if (opts.all || opts.words) lists.push(readList(WORDS_FILE));
  if (opts.file) lists.push(readList(opts.file));
  if (opts.all) {
    lists.push([...product(patternToSlots('LLLL', 'letters'))].filter(hasRepeat));
    lists.push([...product(patternToSlots('LLL', 'letters'))]);
  }
  if (opts.shape || opts.pattern || opts.length) {
    let gen = opts.shape
      ? [...fromShape(opts.shape.toLowerCase(), CLASSES[CHARSETS[opts.charset]])]
      : [...product(patternToSlots(opts.pattern ?? '*'.repeat(opts.length), opts.charset))];
    if (opts.repeated) gen = gen.filter(hasRepeat);
    lists.push(gen);
  }
  const names = [...new Set(lists.flat())].filter(isValidLabel);
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
  return { status: 'error', detail: 'RDAP unreachable after several retries' };
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
  console.log(`Candidates: ${all.length} | already checked: ${skipped} | this run: ${queue.length}`);
  if (!queue.length) return;

  const stats = { taken: 0, available: 0, likely: 0, error: 0 };
  const record = (domain, status, detail = '') => {
    stats[status === 'likely-available' ? 'likely' : status]++;
    appendFileSync(opts.out, [domain, status, csv(detail), new Date().toISOString()].join(',') + '\n');
    if (status === 'available') {
      console.log(`AVAILABLE: ${domain}`);
      appendFileSync(opts.txt, domain + '\n');
    }
    else if (status === 'likely-available') console.log(`likely available (DNS only): ${domain}`);
    else if (!opts.quiet && status === 'error') console.log(`  error ${domain}: ${detail}`);
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
    console.log(`No NS: ${toRdap.length} — confirming with the Verisign registry...`);
    await pool(toRdap, opts.rdapConcurrency, async (domain) => {
      const r = await rdapCheck(domain);
      record(domain, r.status, r.detail);
      await sleep(opts.rdapDelay);
    });
  }

  console.log(
    `\nDone: taken ${stats.taken} | available ${stats.available}` +
      (stats.likely ? ` | likely ${stats.likely}` : '') +
      (stats.error ? ` | errors ${stats.error} (retried on the next run)` : '') +
      `\nResults: ${opts.out}` +
      (stats.available ? `\nAvailable list: ${opts.txt}` : ''),
  );
}

main().catch((e) => die(e.stack ?? String(e)));
