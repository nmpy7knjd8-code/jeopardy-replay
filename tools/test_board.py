from playwright.sync_api import sync_playwright
import pathlib
u=pathlib.Path('/workspace/jeopardy-app/index.html').as_uri()
JS="""()=>{const b=document.querySelector('.board'),cells=[...b.querySelectorAll('.cell')],cats=[...b.querySelectorAll('.cat')];
 const br=b.getBoundingClientRect();
 const vfit=cells.every(c=>{const s=c.firstElementChild;return s.getBoundingClientRect().width<=c.clientWidth-4});
 const cfit=cats.every(c=>c.firstElementChild.offsetHeight<=c.clientHeight&&c.firstElementChild.scrollWidth<=c.clientWidth+1);
 return {board:[Math.round(br.width),Math.round(br.height),Math.round(br.top)],cell:[cells[0].clientWidth,cells[0].clientHeight],cat:[cats[0].clientWidth,cats[0].clientHeight],valueFont:getComputedStyle(cells[0].firstElementChild).fontSize,catFonts:[...new Set(cats.map(c=>c.firstElementChild.style.fontSize))],valuesFit:vfit,catsFit:cfit,w:innerWidth,h:innerHeight}}"""
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for n,vp,m in (('m',{'width':390,'height':844},True),('m375',{'width':375,'height':667},True),('d',{'width':1280,'height':720},False)):
        for ep in ('9434','9402','9369'):
            pg=b.new_page(viewport=vp,device_scale_factor=2 if m else 1,is_mobile=m,has_touch=m)
            pg.on('console',lambda x:errs.append(x.text) if x.type in('error','warning') else None); pg.on('pageerror',lambda e:errs.append(str(e)))
            pg.goto(u+'?ep='+ep); pg.click('#go'); pg.wait_for_selector('.board'); pg.wait_for_timeout(400)
            print(n,ep,'J',pg.evaluate(JS))
            if ep=='9434': pg.screenshot(path=f'/workspace/jeopardy-app/screenshots/{n}-board.png')
            pg.evaluate("__startRound('DJ')"); pg.wait_for_timeout(400)
            print(n,ep,'DJ',pg.evaluate(JS))
            if ep=='9434': pg.screenshot(path=f'/workspace/jeopardy-app/screenshots/{n}-board-dj.png')
            pg.close()
    b.close()
print('ERR',errs)
