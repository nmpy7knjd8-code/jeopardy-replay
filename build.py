#!/usr/bin/env python3
"""Assembles index.html from src/ (template, css, js, game data) + embedded fonts."""
import base64, json, pathlib
r = pathlib.Path(__file__).parent
fonts = [("Anton","400","Anton-400.woff2"),("Libre Baskerville","700","LibreBaskerville-700.woff2"),("Oswald","200 700","Oswald-500.woff2")]
ff = "".join("@font-face{font-family:'%s';font-weight:%s;font-style:normal;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2')}\n" % (n,w,base64.b64encode((r/'fonts'/f).read_bytes()).decode()) for n,w,f in fonts)
t = (r/'src/index.template.html').read_text()
data = json.dumps(json.loads((r/'src/game-9551.json').read_text()), ensure_ascii=False, separators=(',',':')).replace('</','<\\/')
t = t.replace('/*FONTS*/', ff).replace('/*CSS*/', (r/'src/style.css').read_text()).replace('/*JS*/', (r/'src/app.js').read_text())
t = t.replace('/*DATA*/', data)   # data last so game text can't collide with markers
(r/'index.html').write_text(t)
print('index.html', len(t)//1024, 'KB')
