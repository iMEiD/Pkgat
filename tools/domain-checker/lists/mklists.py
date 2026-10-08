import itertools, os
OUT = os.path.dirname(os.path.abspath(__file__))

def write(name, header, sections):
    seen, lines = set(), [f'# {h}' for h in header]
    for title, names in sections:
        lines.append(f'\n# ── {title}')
        for n in names:
            n = n.lower()
            if n not in seen and 3 <= len(n) <= 15 and n.isalnum():
                seen.add(n); lines.append(n)
    open(os.path.join(OUT, name), 'w').write('\n'.join(lines) + '\n')
    print(name, len(seen))

# ───────── السوق الخليجي والعربي ─────────
words = '''oud oudh bukhoor bakhoor abaya abayat bisht shemagh dallah dalla gahwa qahwa finjan tamr
asal majlis souq sooq souk dukkan matjar diwan sanad wasl falak najm noor nour baraka barakah khair
khayr salam yalla habibi marhaba ahlan sahtain sufra mandi kabsa harees jareesh luqaimat kunafa knafeh
arees aroos farah zaffa henna rizq amana thiqa wafa nakheel sahra wadi jabal rimal bahr umrah ziyara
safar rihla musafir siyaha funduq shaqa istiraha istraha mukhayam khayma kashta barr sayara mazad
dalal simsar aqar aqari maktab ustaz tabib tabibi saydaliya attar ataar misk anbar zafaran riyal
dirham dinar tharwa tijara bayaa shari sooqna matjari dukkani'''.split()
cities = '''riyadh jeddah dammam khobar makkah mecca madinah medina taif abha tabuk hail qassim buraidah
jazan najran yanbu ahsa jubail alula dubai abudhabi sharjah doha kuwait bahrain muscat'''.split()
services = '''cars homes rent clinic dental events tours trips jobs food cafe coffee gold perfume oud deals
market guide hotel camp salon gym movers cleaning tutor wedding'''.split()
gulf_suffix = 'hub app go box online store shop now plus'.split()
write('gulf.txt',
  ['قوائم للسوق الخليجي والعربي: كلمات عربية بحروف لاتينية، ومدينة + خدمة، وكلمة عربية + لاحقة'],
  [('كلمات عربية', words),
   ('مدينة + خدمة', [c + s for c, s in itertools.product(cities, services)]),
   ('كلمة عربية + لاحقة', [w + s for w, s in itertools.product(words[:60], gulf_suffix)])])

# ───────── الشركات الناشئة العالمية ─────────
trend = '''agent agents prompt copilot robot bot solar battery charge grid volt health clinic pet vet sleep
gene carbon climate water drone orbit quantum wallet pay cash fund invest loan tax payroll hire
crew learn tutor code data cloud vault shield signal pulse'''.split()
suffix = 'hq labs hub base stack flow desk works pilot kit ai mate'.split()
prefix = 'get try use go my join hey'.split()
write('startups.txt',
  ['أسماء للشركات الناشئة: كلمة مجال صاعد + لاحقة، أو بادئة + كلمة — الصيغ اللي تشتريها الشركات عادة'],
  [('كلمة + لاحقة', [t + s for t, s in itertools.product(trend, suffix)]),
   ('بادئة + كلمة', [p + t for p, t in itertools.product(prefix, trend)])])

# ───────── السوق الإسلامي العالمي ─────────
halal = 'pay bank invest fund food eats trip travel stays market check wallet loans home save wealth'.split()
umrah = 'trip trips tours guide plan go hub stay visa travel'.split()
modest = 'wear fashion swim style shop'.split()
write('islamic.txt',
  ['السوق الإسلامي العالمي (قرابة ملياري مستهلك): التمويل الحلال، العمرة والحج، الأزياء المحتشمة'],
  [('halal', ['halal' + s for s in halal]),
   ('umrah / hajj', [b + s for b in ('umrah', 'hajj') for s in umrah]),
   ('modest', ['modest' + s for s in modest])])
