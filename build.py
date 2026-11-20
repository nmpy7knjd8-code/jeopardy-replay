#!/usr/bin/env python3
"""Assembles index.html from src/ (template, css, js, game data) + embedded fonts."""
import base64, json, pathlib
r = pathlib.Path(__file__).parent
fonts = [("Anton","400","Anton-400.woff2"),("Libre Baskerville","700","LibreBaskerville-700.woff2"),("Oswald","200 700","Oswald-500.woff2")]
ff = "".join("@font-face{font-family:'%s';font-weight:%s;font-style:normal;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2')}\n" % (n,w,base64.b64encode((r/'fonts'/f).read_bytes()).decode()) for n,w,f in fonts)
t = (r/'src/index.template.html').read_text()
import re
TAGS={'9434':"Jamie Ding's 32nd game",'9402':"Jamie Ding's record-setting game",'9369':'Tournament of Champions exhibition'}
PRES=re.compile(r'^\s*\((?=[^)]*(?:present|report|Clue Crew|reads|introduc|video|host))[^)]*\)\s*',re.I)
def clean(q):
    while PRES.match(q): q=PRES.sub('',q,1)
    return q
eps=[]
for f in (r/'src/episodes').glob('*.json'):
    e=json.loads(f.read_text())
    for k in ('J','DJ'):
        for c in e['rounds'][k]['clues']:
            c['q']=clean(c['q']); c.pop('img',None)
            mp=r/'media'/f"{e['gameId']}-{k}_{c['c']}_{c['r']}.jpg"
            if mp.exists(): c['img']='media/'+mp.name
    e['final']['q']=clean(e['final']['q']); e['tag']=TAGS.get(e['gameId'],''); e.pop('note',None)
    eps.append(e)
eps.sort(key=lambda e:e['aired'],reverse=True)
data = json.dumps(eps, ensure_ascii=False, separators=(',',':')).replace('</','<\\/')
t = t.replace('/*FONTS*/', ff).replace('/*CSS*/', (r/'src/style.css').read_text()).replace('/*JS*/', (r/'src/app.js').read_text())
t = t.replace('/*DATA*/', data)   # data last so game text can't collide with markers
(r/'index.html').write_text(t)
print('index.html', len(t)//1024, 'KB')
