"""Screenshots of every control surface: intro, board, clue card (phone 375 + desktop). Usage: shot_ui.py <prefix>"""
import sys, pathlib
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent; u=(root/'index.html').as_uri(); pre=sys.argv[1] if len(sys.argv)>1 else 'ui'
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for n,vp,m in (('m375',{'width':375,'height':667},1),('d',{'width':1024,'height':577},0)):
        pg=b.new_page(viewport=vp,device_scale_factor=2 if m else 1,is_mobile=bool(m),has_touch=bool(m))
        pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda x:errs.append(x.text) if x.type=='error' else None)
        pg.clock.install(); pg.goto(u+'?ep=9434'); pg.evaluate('document.fonts.ready'); pg.clock.run_for(300)
        pg.screenshot(path=str(root/f'screenshots/{pre}-{n}-intro.png'))
        pg.click('#go'); pg.clock.run_for(500); pg.evaluate("dispatchEvent(new Event('resize'))"); pg.clock.run_for(100)
        pg.screenshot(path=str(root/f'screenshots/{pre}-{n}-board.png'))
        for i in range(200):
            pg.clock.run_for(100)
            if pg.evaluate("__G.state")=='open': break
        pg.clock.run_for(900); pg.screenshot(path=str(root/f'screenshots/{pre}-{n}-clue.png'))
        pg.keyboard.press('Space'); pg.clock.run_for(300); pg.screenshot(path=str(root/f'screenshots/{pre}-{n}-answer.png'))
        pg.close()
print('ERR',errs)
