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
            mp=r/'media'/f"{e['gameId']}-{k}_{c['c']}_{c['r']}.jpg"
            if mp.exists(): c['img']='media/'+mp.name
    e['final']['q']=clean(e['final']['q']); e['show']='#'+re.sub(r'\D','',e['show']); e['tag']=TAGS.get(e['gameId'],''); e.pop('note',None)
    e['season']=season_of(e['aired']); e['seasonYears']=season_years(e['season'])
    eps.append(e)
eps.sort(key=lambda e:e['aired'],reverse=True)
out=r/'episodes'
if out.exists(): shutil.rmtree(out)
out.mkdir()
catalog=[]
for e in eps:
    (out/f"{e['gameId']}.json").write_text(json.dumps(e, ensure_ascii=False, separators=(',',':')), encoding='utf-8')
    catalog.append({
        'gameId':e['gameId'],'show':e['show'],'aired':e['aired'],'tag':e.get('tag',''),
        'season':e['season'],'seasonYears':e['seasonYears'],
        'contestants':[{'name':c['name'],'short':c['short']} for c in e['contestants']],
        'scores':e['scores'],
        'pics':sum(1 for k in ('J','DJ') for c in e['rounds'][k]['clues'] if c.get('img'))
    })
data = json.dumps(catalog, ensure_ascii=False, separators=(',',':')).replace('</','<\\/')
t = t.replace('/*FONTS*/', ff).replace('/*CSS*/', (r/'src/style.css').read_text()).replace('/*JS*/', (r/'src/app.js').read_text())
t = t.replace('/*DATA*/', data)
(r/'index.html').write_text(t)
print('index.html', len(t)//1024, 'KB;', len(catalog), 'episodes;', sum((out/f'{e["gameId"]}.json').stat().st_size for e in catalog)//1024, 'KB JSON')
