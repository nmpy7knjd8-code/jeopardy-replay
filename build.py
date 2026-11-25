#!/usr/bin/env python3
"""Assembles index.html (catalog only) and per-episode JSON under episodes/ for on-demand load."""
import base64, json, pathlib, re, shutil
r = pathlib.Path(__file__).parent
KEEP=set(json.loads((r/'tools/keep.json').read_text()))
fonts = [("Anton","400","Anton-400.woff2"),("Libre Baskerville","700","LibreBaskerville-700.woff2"),("Oswald","200 700","Oswald-500.woff2")]
ff = "".join("@font-face{font-family:'%s';font-weight:%s;font-style:normal;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2')}\n" % (n,w,base64.b64encode((r/'fonts'/f).read_bytes()).decode()) for n,w,f in fonts)
t = (r/'src/index.template.html').read_text()
TAGS={'9434':"Jamie Ding's 32nd game",'9402':"Jamie Ding's record-setting game",'9369':'Tournament of Champions exhibition','9578':"Will Goree's 5th game",'9571':"Erica Doornek's 5th game",'9562':"Anthony Cantor's 5th game",'7537':"Cris Pannullo's 18th game",'8958':"Adriana Harmeyer's 3rd game",'4413':'Arthur Chu'}
PRES=re.compile(r'^\s*\((?=[^)]*(?:present|report|Clue Crew|reads|introduc|video|host))[^)]*\)\s*',re.I)
def clean(q):
    while PRES.match(q): q=PRES.sub('',q,1)
    return q
def season_of(aired):
    y,m=int(aired[:4]),int(aired[5:7])
    return y-1983 if m>=9 else y-1984
def season_years(n):
    a,b=1983+n,1984+n
    return f"{a}–{b if b%100==0 else str(b)[2:]}"
eps=[]
for f in (r/'src/episodes').glob('*.json'):
    if f.stem not in KEEP: continue
    e=json.loads(f.read_text())
    for k in ('J','DJ'):
        for c in e['rounds'][k]['clues']:
            c['q']=clean(c['q']); c.pop('img',None)
            stem=f"{e['gameId']}-{k}_{c['c']}_{c['r']}"
            mp=next((r/'media'/f'{stem}.{ext}' for ext in ('webp','jpg') if (r/'media'/f'{stem}.{ext}').exists()), None)
            if mp: c['img']='media/'+mp.name
    e['final']['q']=clean(e['final']['q']); e['show']='#'+re.sub(r'\D','',e['show']); e['tag']=TAGS.get(e['gameId'],''); e.pop('note',None)
    e['season']=season_of(e['aired']); e['seasonYears']=season_years(e['season'])
    eps.append(e)
eps.sort(key=lambda e:e['aired'],reverse=True)
out=r/'episodes'

# Difficulty 1–10 (higher = harder). Each game gets a raw hardness score
# from J! + DJ! clues (Final is excluded), then a catalog-wide percentile:
#   40% value-weighted triple-stumper rate
#       sum(face value of stumper / unanswered clues) / sum(face of all clues)
#   25% wrong-answer rate
#       wrong buzzes / (right + wrong buzzes); 0 if nobody rang in
#   25% missed first-right rate
#       1 − (clues with a right and no wrong / non-Daily-Double clues)
#   10% inverted combined official Coryat (DDs at face, Final out)
#       1 − clamp(combined / 34600, 0, 1.5) / 1.5
#       so a typical $34,600 combined board is mid-soft; a low Coryat
#       pulls the game harder.
# Ties share an average rank. Percentile p in [0, 1] maps to
#   rating = max(1, min(10, round(1 + 9*p))).
# 1 is easiest, 10 is hardest.
CORYAT_BASELINE = 34600
def episode_hardness(e, baseline=CORYAT_BASELINE):
    face=stump=0
    rights=wrongs=0
    nondd=firstright=0
    coryat=0
    for rnd in ('J','DJ'):
        for c in (e.get('rounds') or {}).get(rnd, {}).get('clues') or []:
            v=c.get('v') or 0
            face+=v
            nr=len(c.get('right') or [])
            nw=len(c.get('wrong') or [])
            rights+=nr
            wrongs+=nw
            if c.get('stumper') or not nr:
                stump+=v
            if not c.get('dd'):
                nondd+=1
                if nr and not nw:
                    firstright+=1
            coryat+=v*nr-v*nw
    stumper_rate=(stump/face) if face else 0
    wrong_rate=(wrongs/(rights+wrongs)) if (rights+wrongs) else 0
    miss_first=1-((firstright/nondd) if nondd else 0)
    inv_coryat=1-min(1.5, max(0, coryat/baseline))/1.5
    return 0.40*stumper_rate + 0.25*wrong_rate + 0.25*miss_first + 0.10*inv_coryat

def assign_difficulty(eps):
    raws=[episode_hardness(e) for e in eps]
    n=len(raws)
    order=sorted(range(n), key=lambda i: raws[i])
    ranks=[0]*n
    i=0
    while i<n:
        j=i
        while j+1<n and raws[order[j+1]]==raws[order[i]]:
            j+=1
        mid=(i+j)/2
        for k in range(i,j+1):
            ranks[order[k]]=mid
        i=j+1
    denom=max(1, n-1)
    for e,r in zip(eps, ranks):
        p=r/denom
        e['diff']=max(1, min(10, int(round(1+9*p))))

if out.exists(): shutil.rmtree(out)
out.mkdir()
assign_difficulty(eps)
catalog=[]
for e in eps:
    (out/f"{e['gameId']}.json").write_text(json.dumps(e, ensure_ascii=False, separators=(',',':')), encoding='utf-8')
    catalog.append({
        'gameId':e['gameId'],'show':e['show'],'aired':e['aired'],'tag':e.get('tag',''),
        'season':e['season'],'seasonYears':e['seasonYears'],
        'contestants':[{'name':c['name'],'short':c['short']} for c in e['contestants']],
        'scores':e['scores'],
        'pics':sum(1 for k in ('J','DJ') for c in e['rounds'][k]['clues'] if c.get('img')),
        'diff':e['diff']
    })
data = json.dumps(catalog, ensure_ascii=False, separators=(',',':')).replace('</','<\\/')
t = t.replace('/*FONTS*/', ff).replace('/*CSS*/', (r/'src/style.css').read_text()).replace('/*JS*/', (r/'src/app.js').read_text())
t = t.replace('/*DATA*/', data)
(r/'index.html').write_text(t)
players_src=r/'src'/'players.json'
if players_src.exists():
    shutil.copyfile(players_src, r/'players.json')
    print('players.json', players_src.stat().st_size, 'bytes')
else:
    print('players.json missing (ELO will be hidden)')

print('index.html', len(t)//1024, 'KB;', len(catalog), 'episodes;', sum((out/f'{e["gameId"]}.json').stat().st_size for e in catalog)//1024, 'KB JSON')
