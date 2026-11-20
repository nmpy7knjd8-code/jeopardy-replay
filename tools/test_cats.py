"""Verify no board category word breaks mid-word (phone + desktop, all episodes, both rounds)."""
from playwright.sync_api import sync_playwright
import pathlib, sys
root=pathlib.Path(__file__).resolve().parent.parent
u=(root/'index.html').as_uri()
JS="""()=>{const out={bad:[],fonts:new Set(),n:0};
 document.querySelectorAll('.cat').forEach(c=>{const sp=c.firstElementChild,cs=getComputedStyle(c);
  const inner=c.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
  out.fonts.add(sp.style.fontSize);
  const tn=sp.firstChild,txt=tn.textContent;let i=0;
  for(const w of txt.split(/[\\s-]+/)){const st=txt.indexOf(w,i);i=st+w.length;
   const r=document.createRange();r.setStart(tn,st);r.setEnd(tn,st+w.length);
   const rects=[...r.getClientRects()];out.n++;
   if(rects.length!==1||r.getBoundingClientRect().width>inner+.5)out.bad.push([txt,w,rects.length,+r.getBoundingClientRect().width.toFixed(1),+inner.toFixed(1)]);}
  if(sp.offsetHeight>c.clientHeight+.5)out.bad.push([txt,'HEIGHT overflow',sp.offsetHeight,c.clientHeight]);
 });out.fonts=[...out.fonts];return out}"""
errs=[];fail=0
with sync_playwright() as p:
    b=p.chromium.launch()
    for n,vp,m in (('m',{'width':390,'height':844},1),('m375',{'width':375,'height':667},1),('m360',{'width':360,'height':640},1),('d',{'width':1024,'height':577},0)):
        for ep in ('9578','9571','9562','9434','9402','9369'):
            pg=b.new_page(viewport=vp,device_scale_factor=2 if m else 1,is_mobile=bool(m),has_touch=bool(m))
            pg.on('console',lambda x:errs.append(x.text) if x.type=='error' else None); pg.on('pageerror',lambda e:errs.append(str(e)))
            pg.clock.install(); pg.goto(u+'?ep='+ep); pg.click('#go'); pg.wait_for_selector('#set'); pg.evaluate('document.fonts.ready')
            for rd in ('J','DJ'):
                if rd=='DJ': pg.evaluate("__startRound('DJ')")
                pg.clock.run_for(500); pg.evaluate("dispatchEvent(new Event('resize'))"); pg.clock.run_for(100)
                r=pg.evaluate(JS); fail+=len(r['bad'])
                print(n,ep,rd,'words',r['n'],'font',r['fonts'],'BAD' if r['bad'] else 'ok',r['bad'])
                if ep=='9434' and rd=='J' and m: pg.screenshot(path=str(root/f'screenshots/{n}-board.png'))
                if ep=='9434' and rd=='DJ' and m: pg.screenshot(path=str(root/f'screenshots/{n}-board-dj.png'))
                if ep=='9434' and n=='d': pg.screenshot(path=str(root/f'screenshots/d-board{"-dj" if rd=="DJ" else ""}.png'))
            pg.close()
print('FAILS',fail,'ERRORS',errs)
