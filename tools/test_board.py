from playwright.sync_api import sync_playwright
import pathlib,sys
u=pathlib.Path(''+__import__('os').path.dirname(__import__('os').path.dirname(__file__))+'/index.html').as_uri()
JS="""()=>{const set=document.getElementById('set');const cells=[...set.querySelectorAll('.cell')],cats=[...set.querySelectorAll('.cat')];
 const vfit=cells.every(c=>{const s=c.firstElementChild,r=s.getBoundingClientRect(),cr=c.getBoundingClientRect();return r.left>=cr.left&&r.right<=cr.right&&r.top>=cr.top&&r.bottom<=cr.bottom});
 const cfit=cats.every(c=>c.firstElementChild.offsetHeight<=c.clientHeight&&c.firstElementChild.scrollWidth<=c.clientWidth+1);
 const sr=set.getBoundingClientRect();
 return {set:[Math.round(sr.width),Math.round(sr.height),Math.round(sr.left),Math.round(sr.top)],cell:[Math.round(cells[0].clientWidth),Math.round(cells[0].clientHeight)],cat:[Math.round(cats[0].clientWidth),Math.round(cats[0].clientHeight)],val:getComputedStyle(cells[0].firstElementChild).fontSize,catF:[...new Set(cats.map(c=>c.firstElementChild.style.fontSize))],vfit,cfit,vw:innerWidth,bodyOverflow:document.documentElement.scrollWidth>innerWidth}}"""
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for n,vp,m in (('d',{'width':1024,'height':577},False),('d1280',{'width':1280,'height':720},False),('m',{'width':390,'height':844},True),('m375',{'width':375,'height':667},True)):
        for ep in ('9434','9402','9369'):
            pg=b.new_page(viewport=vp,device_scale_factor=2 if m else 1,is_mobile=m,has_touch=m)
            pg.on('console',lambda x:errs.append(x.text) if x.type in('error','warning') else None); pg.on('pageerror',lambda e:errs.append(str(e)))
            pg.clock.install(); pg.goto(u+'?ep='+ep); pg.click('#go'); pg.wait_for_selector('#set'); pg.evaluate('document.fonts.ready'); pg.clock.run_for(500); pg.evaluate("dispatchEvent(new Event('resize'))"); pg.clock.run_for(100)
            print(n,ep,'J',pg.evaluate(JS))
            if ep=='9434': pg.screenshot(path=__import__('os').path.dirname(__import__('os').path.dirname(__file__))+f'/screenshots/{n}-board.png')
            pg.evaluate("__startRound('DJ')"); pg.clock.run_for(500); pg.evaluate("dispatchEvent(new Event('resize'))"); pg.clock.run_for(100)
            print(n,ep,'DJ',pg.evaluate(JS))
            if ep=='9434': pg.screenshot(path=__import__('os').path.dirname(__import__('os').path.dirname(__file__))+f'/screenshots/{n}-board-dj.png')
            pg.close()
    b.close()
print('ERR',errs)
