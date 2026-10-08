import itertools, os, re
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'global.txt')

# ١) أسماء مبتكرة: جذر بإيحاء عالمي + نهاية ناعمة (lumora, novexa, zenia)
roots = '''lum nov vel zen sol aur kai nex vio cor ver lux flo mir ori ast cel ela eva hal ion jun
kor lyr mav nym oli pax qui rev sen tal uni val vox zar ary bel cal dor fen gal hel'''.split()
ends = 'a ia io ora ova exa ix eo era ari ena ino ity iva oni yra ux'.split()
brand = []
for r, e in itertools.product(roots, ends):
    if r[-1] in 'aeiou' and e[0] in 'aeiouy':
        n = r[:-1] + e
    else:
        n = r + e
    if 4 <= len(n) <= 7 and not re.search(r'(.)\1\1|[aeiou]{3}', n):
        brand.append(n)

# ١ب) سداسية مبتكرة سهلة النطق (ketori, novesa): حروف ناعمة، بلا تكرار ساكن،
# حرف واحد على الأكثر من z/v/k، وتنتهي بـ a/o/i. عيّنة ثابتة 3000 من 30,240
import random
C, V = 'bdklmnrstvz', 'aeio'
invented = []
for c1, v1, c2, v2, c3, v3 in itertools.product(C, V, C, V, C, 'aoi'):
    cs = [c1, c2, c3]
    if len(set(cs)) < 3 or sum(c in 'zvk' for c in cs) > 1 or v1 == v2:
        continue
    invented.append(c1 + v1 + c2 + v2 + c3 + v3)
random.Random(7).shuffle(invented)
invented = invented[:3000]

# ٢) صفة + اسم: الصيغة الأشهر للشركات الناشئة (brightfox, quietpeak)
adj = '''bright quiet bold calm clear swift true pure wild prime noble brave lucky happy smart
fresh golden silver north blue green red iron stone cloud solid simple rapid vivid'''.split()
noun = '''fox owl wolf bear hawk lion peak ridge river ocean forest field harbor bridge tower
nest hive forge lab studio works path trail spark flame wave orbit pixel atlas compass anchor'''.split()
pairs = [a + n for a, n in itertools.product(adj, noun)]

# ٣) فعل + اسم: أسماء أدوات ومنتجات (buildnest, shipdesk)
verb = 'build ship grow make launch scale craft track plan sync boost fuel'.split()
tool = 'desk base stack flow kit nest hub box board deck loop dock'.split()
actions = [v + t for v, t in itertools.product(verb, tool)]

seen, lines = set(), ['# أسماء عالمية لإعادة البيع: مبتكرة (lumora)، سداسية (ketori)، صفة + اسم (brightfox)، فعل + أداة (shipdesk)']
for title, names in [('مبتكرة', brand), ('سداسية مبتكرة', invented), ('صفة + اسم', pairs), ('فعل + أداة', actions)]:
    lines.append(f'\n# ── {title}')
    for n in names:
        if n not in seen:
            seen.add(n); lines.append(n)
open(OUT, 'w').write('\n'.join(lines) + '\n')
print(len(brand), len(invented), len(pairs), len(actions), len(seen))
print(' '.join(brand[:40]))
