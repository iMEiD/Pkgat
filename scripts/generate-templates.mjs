/**
 * مولّد خلفيات القوالب الجاهزة لمنصة بكجات.
 *
 * كل خلفية 1080×1920 — نفس مقاس الكانفس في src/lib/design/defaults.ts.
 * الزخرفة مركّزة في الثلث العلوي، والنصف السفلي يُترك هادئاً وفاتحاً
 * لأن اسم المدعو يُرسم عند y≈0.62 والباركود عند y≈0.84.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const W = 1080;
const H = 1920;

const OUT = process.argv[2];
if (!OUT) throw new Error('حدّد مجلد الإخراج');
mkdirSync(OUT, { recursive: true });

/** إطار رفيع مزدوج حول التصميم */
function frame(color, opacity = 1) {
  return `
    <rect x="46" y="46" width="${W - 92}" height="${H - 92}"
          fill="none" stroke="${color}" stroke-width="3" opacity="${opacity}"/>
    <rect x="62" y="62" width="${W - 124}" height="${H - 124}"
          fill="none" stroke="${color}" stroke-width="1.5" opacity="${opacity * 0.6}"/>`;
}

/** زخرفة زاوية على شكل أوراق متناظرة */
function cornerFlourish(x, y, scale, rotate, color) {
  return `
    <g transform="translate(${x} ${y}) rotate(${rotate}) scale(${scale})" fill="none"
       stroke="${color}" stroke-width="2.4" stroke-linecap="round">
      <path d="M0 0 C 48 6 86 34 104 78"/>
      <path d="M0 0 C 6 48 34 86 78 104"/>
      <path d="M18 14 C 52 26 72 46 84 80" opacity="0.55"/>
      <path d="M14 18 C 26 52 46 72 80 84" opacity="0.55"/>
      <circle cx="104" cy="78" r="5" fill="${color}" stroke="none"/>
      <circle cx="78" cy="104" r="5" fill="${color}" stroke="none"/>
      <circle cx="6" cy="6" r="7" fill="${color}" stroke="none" opacity="0.8"/>
    </g>`;
}

/** فاصل أفقي بمعيّن في المنتصف */
function divider(y, width, color) {
  const half = width / 2;
  return `
    <g stroke="${color}" stroke-width="2" stroke-linecap="round">
      <line x1="${W / 2 - half}" y1="${y}" x2="${W / 2 - 26}" y2="${y}"/>
      <line x1="${W / 2 + 26}" y1="${y}" x2="${W / 2 + half}" y2="${y}"/>
    </g>
    <rect x="${W / 2 - 9}" y="${y - 9}" width="18" height="18"
          transform="rotate(45 ${W / 2} ${y})" fill="${color}"/>`;
}

/** هالة بيضاء ناعمة تضمن وضوح الاسم والباركود فوق أي خلفية */
function calmZone(color = '#FFFFFF', opacity = 0.55) {
  return `
    <ellipse cx="${W / 2}" cy="${H * 0.75}" rx="${W * 0.62}" ry="${H * 0.24}"
             fill="${color}" opacity="${opacity}" filter="url(#soften)"/>`;
}

const defs = `
  <defs>
    <filter id="soften" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="60"/>
    </filter>
  </defs>`;

/** نقش هندسي إسلامي متكرر (ثماني النجوم) */
function geometricPattern(id, color, opacity) {
  return `
    <pattern id="${id}" width="120" height="120" patternUnits="userSpaceOnUse">
      <g stroke="${color}" stroke-width="1.6" fill="none" opacity="${opacity}">
        <path d="M60 12 L108 60 L60 108 L12 60 Z"/>
        <path d="M60 30 L90 60 L60 90 L30 60 Z"/>
        <path d="M12 12 L108 108 M108 12 L12 108" opacity="0.4"/>
      </g>
    </pattern>`;
}

const templates = [];

/* ---------- ١. عرس — ذهبي كلاسيكي ---------- */
templates.push({
  slug: 'wedding-gold',
  name: 'عرس — ذهبي كلاسيكي',
  category: 'wedding',
  nameColor: '#6B4E16',
  font: 'Aref Ruqaa',
  svg: `
    ${defs}
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FFFDF7"/>
        <stop offset="55%" stop-color="#FBF4E4"/>
        <stop offset="100%" stop-color="#F6EAD2"/>
      </linearGradient>
      ${geometricPattern('geo1', '#C9A227', 0.16)}
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="760" fill="url(#geo1)"/>
    ${calmZone('#FFFDF7', 0.75)}
    ${frame('#C9A227', 0.85)}
    ${cornerFlourish(96, 96, 1, 0, '#C9A227')}
    ${cornerFlourish(W - 96, 96, 1, 90, '#C9A227')}
    ${cornerFlourish(W - 96, H - 96, 1, 180, '#C9A227')}
    ${cornerFlourish(96, H - 96, 1, 270, '#C9A227')}
    ${divider(430, 220, '#C9A227')}
    <circle cx="${W / 2}" cy="300" r="66" fill="none" stroke="#C9A227" stroke-width="2.5" opacity="0.9"/>
    <circle cx="${W / 2}" cy="300" r="52" fill="none" stroke="#C9A227" stroke-width="1.2" opacity="0.55"/>
    ${divider(1035, 260, '#C9A227')}`,
});

/* ---------- ٢. عرس — وردي ناعم ---------- */
templates.push({
  slug: 'wedding-blush',
  name: 'عرس — وردي ناعم',
  category: 'wedding',
  nameColor: '#8C3D5B',
  font: 'Amiri',
  svg: `
    ${defs}
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="#FFF6F8"/>
        <stop offset="50%" stop-color="#FDEBF0"/>
        <stop offset="100%" stop-color="#F9DDE6"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.18" r="0.6">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    <g transform="translate(${W / 2} 330)">
      ${Array.from({ length: 8 }, (_, i) => {
        const a = (360 / 8) * i;
        return `<ellipse cx="0" cy="-96" rx="34" ry="82" fill="#E8A0BC" opacity="0.34"
                         transform="rotate(${a})"/>`;
      }).join('')}
      ${Array.from({ length: 8 }, (_, i) => {
        const a = (360 / 8) * i + 22.5;
        return `<ellipse cx="0" cy="-62" rx="22" ry="54" fill="#F3C3D3" opacity="0.5"
                         transform="rotate(${a})"/>`;
      }).join('')}
      <circle cx="0" cy="0" r="26" fill="#D98BA8" opacity="0.7"/>
    </g>
    ${Array.from({ length: 22 }, (_, i) => {
      const x = 96 + ((i * 397) % (W - 192));
      const y = 640 + ((i * 233) % 300);
      const r = 4 + ((i * 7) % 9);
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="#E8A0BC" opacity="${0.14 + ((i % 4) * 0.05)}"/>`;
    }).join('')}
    ${calmZone('#FFFFFF', 0.72)}
    ${frame('#D98BA8', 0.7)}
    ${cornerFlourish(104, 104, 0.92, 0, '#D98BA8')}
    ${cornerFlourish(W - 104, 104, 0.92, 90, '#D98BA8')}
    ${cornerFlourish(W - 104, H - 104, 0.92, 180, '#D98BA8')}
    ${cornerFlourish(104, H - 104, 0.92, 270, '#D98BA8')}
    ${divider(560, 200, '#D98BA8')}
    ${divider(1050, 240, '#D98BA8')}`,
});

/* ---------- ٣. تخرج — كحلي أكاديمي ---------- */
templates.push({
  slug: 'graduation-navy',
  name: 'تخرج — كحلي أكاديمي',
  category: 'graduation',
  nameColor: '#12224A',
  font: 'Noto Kufi Arabic',
  svg: `
    ${defs}
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#12224A"/>
        <stop offset="42%" stop-color="#1B3268"/>
        <stop offset="62%" stop-color="#E8EDF7"/>
        <stop offset="100%" stop-color="#F7F9FD"/>
      </linearGradient>
      ${geometricPattern('geo3', '#D4B25A', 0.28)}
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="700" fill="url(#geo3)"/>
    <g stroke="#D4B25A" stroke-width="2.5" fill="none" opacity="0.95">
      <path d="M${W / 2 - 120} 300 L${W / 2} 240 L${W / 2 + 120} 300 L${W / 2} 360 Z"/>
      <path d="M${W / 2 - 66} 330 L${W / 2 - 66} 392 C ${W / 2 - 66} 424 ${W / 2 + 66} 424 ${W / 2 + 66} 392 L${W / 2 + 66} 330"/>
      <path d="M${W / 2 + 120} 300 L${W / 2 + 120} 396"/>
      <circle cx="${W / 2 + 120}" cy="406" r="10" fill="#D4B25A" stroke="none"/>
    </g>
    ${divider(520, 240, '#D4B25A')}
    <rect x="46" y="46" width="${W - 92}" height="${H - 92}"
          fill="none" stroke="#D4B25A" stroke-width="3" opacity="0.55"/>
    ${divider(1080, 260, '#B08D3C')}`,
});

/* ---------- ٤. حفل — احتفالي ملوّن ---------- */
templates.push({
  slug: 'party-confetti',
  name: 'حفل — احتفالي ملوّن',
  category: 'party',
  nameColor: '#2A2521',
  font: 'Marhey',
  svg: `
    ${defs}
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stop-color="#FFF4EC"/>
        <stop offset="48%" stop-color="#FFF9F4"/>
        <stop offset="100%" stop-color="#FDF3FA"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${(() => {
      const colors = ['#FF6B4A', '#6D4AFF', '#17BE94', '#F5B01B', '#F0518B', '#2E90FA'];
      return Array.from({ length: 54 }, (_, i) => {
        const x = 70 + ((i * 421) % (W - 140));
        const y = 90 + ((i * 307) % 820);
        const c = colors[i % colors.length];
        const rot = (i * 47) % 360;
        const op = 0.5 + ((i % 3) * 0.14);
        return i % 3 === 0
          ? `<circle cx="${x}" cy="${y}" r="${7 + (i % 5)}" fill="${c}" opacity="${op}"/>`
          : `<rect x="${x}" y="${y}" width="${11 + (i % 8)}" height="${20 + (i % 12)}" rx="4"
                   fill="${c}" opacity="${op}" transform="rotate(${rot} ${x} ${y})"/>`;
      }).join('');
    })()}
    ${calmZone('#FFFFFF', 0.88)}
    <rect x="52" y="52" width="${W - 104}" height="${H - 104}" rx="34"
          fill="none" stroke="#6D4AFF" stroke-width="3" opacity="0.45"/>
    ${divider(1060, 240, '#6D4AFF')}`,
});

/* ---------- ٥. عام — بيج مينيمال ---------- */
templates.push({
  slug: 'general-sand',
  name: 'عام — بيج مينيمال',
  category: 'general',
  nameColor: '#3A322A',
  font: 'IBM Plex Sans Arabic',
  svg: `
    ${defs}
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FCFAF6"/>
        <stop offset="100%" stop-color="#F1EADD"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <!-- قوس معماري بسيط يؤطّر أعلى الدعوة -->
    <path d="M232 700 L232 400 A 308 308 0 0 1 848 400 L848 700"
          fill="none" stroke="#C2AC88" stroke-width="2.4" opacity="0.75"/>
    <path d="M262 700 L262 410 A 278 278 0 0 1 818 410 L818 700"
          fill="none" stroke="#C2AC88" stroke-width="1.2" opacity="0.42"/>
    <g stroke="#C2AC88" stroke-width="1.6" opacity="0.5" stroke-linecap="round">
      ${Array.from({ length: 7 }, (_, i) => {
        const a = Math.PI * (0.14 + (i * 0.72) / 6);
        const cx = W / 2 - Math.cos(a) * 190;
        const cy = 400 - Math.sin(a) * 190;
        return `<line x1="${W / 2}" y1="400" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}"/>`;
      }).join('')}
    </g>
    <circle cx="${W / 2}" cy="400" r="15" fill="#C2AC88" opacity="0.8"/>
    ${calmZone('#FCFAF6', 0.8)}
    ${frame('#C2AC88', 0.7)}
    ${divider(880, 200, '#B39B74')}`,
});

/* ---------- ٦. عام — أخضر فاخر ---------- */
templates.push({
  slug: 'general-emerald',
  name: 'عام — أخضر فاخر',
  category: 'general',
  nameColor: '#0C3B30',
  font: 'Reem Kufi',
  svg: `
    ${defs}
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0C3B30"/>
        <stop offset="38%" stop-color="#125045"/>
        <stop offset="58%" stop-color="#EAF3F0"/>
        <stop offset="100%" stop-color="#F6FAF9"/>
      </linearGradient>
      ${geometricPattern('geo6', '#CBA84E', 0.3)}
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="640" fill="url(#geo6)"/>
    <g fill="none" stroke="#CBA84E" stroke-width="2.6" opacity="0.95">
      <path d="M${W / 2 - 150} 340 L${W / 2} 200 L${W / 2 + 150} 340 L${W / 2} 480 Z"/>
      <path d="M${W / 2 - 84} 340 L${W / 2} 262 L${W / 2 + 84} 340 L${W / 2} 418 Z" opacity="0.65"/>
      <circle cx="${W / 2}" cy="340" r="22" fill="#CBA84E" stroke="none" opacity="0.9"/>
    </g>
    ${divider(600, 240, '#CBA84E')}
    <rect x="46" y="46" width="${W - 92}" height="${H - 92}"
          fill="none" stroke="#CBA84E" stroke-width="3" opacity="0.5"/>
    ${divider(1090, 260, '#A8863A')}`,
});

for (const t of templates) {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${t.svg}</svg>`;
  writeFileSync(join(OUT, `${t.slug}.svg`), doc.replace(/\n\s+/g, '\n'), 'utf8');
}

writeFileSync(
  join(OUT, 'templates.json'),
  JSON.stringify(
    templates.map(({ slug, name, category, nameColor, font }) => ({ slug, name, category, nameColor, font })),
    null,
    2,
  ),
  'utf8',
);

console.log(`تم توليد ${templates.length} خلفية في ${OUT}`);
