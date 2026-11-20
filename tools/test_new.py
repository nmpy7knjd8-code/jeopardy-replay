"""New episodes end-to-end (auto+fast), real score check, picture loads, round-skip button, header height."""
import json, pathlib, time
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent; u=(root/'index.html').as_uri(); shots=root/'screenshots'
NEW=('9578','9571','9562'); errs=[]
def hook(pg):
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda x:errs.append(x.text) if x.type=='error' else None)
money=lambda v:('-' if v<0 else '')+'$'+f'{abs(v):,}'
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(); hook(pg); pg.goto(u)
    eps=pg.evaluate("EPISODES.map(e=>({id:e.gameId,show:e.show,aired:e.aired,cons:e.contestants.map(c=>[c.name,c.short]),final:e.scores.Final,J:e.scores.J,DJ:e.scores.DJ,imgs:['J','DJ'].flatMap(k=>e.rounds[k].clues.filter(c=>c.img).map(c=>c.img))}))")
    print('episodes in app:',[(e['id'],e['show']) for e in eps])
    # every picture loads
    allimg=[i for e in eps for i in e['imgs']]
    bad=pg.evaluate("async l=>{const r=[];for(const s of l){const ok=await new Promise(res=>{const im=new Image();im.onload=()=>res(im.naturalWidth>0);im.onerror=()=>res(false);im.src=s});if(!ok)r.push(s)}return r}",allimg)
    print('pictures',len(allimg),'failed',bad); print('new-episode pictures',{e['id']:len(e['imgs']) for e in eps if e['id'] in NEW})
    pg.close()
    # round-skip button: J -> DJ -> Final, score unchanged, real scores shown
    for n,vp,m in (('m375',{'width':375,'height':667},1),('d',{'width':1024,'height':577},0)):
        pg=b.new_page(viewport=vp,device_scale_factor=2 if m else 1,is_mobile=bool(m),has_touch=bool(m)); hook(pg)
        pg.clock.install(); pg.goto(u+'?ep=9578'); pg.click('#go'); pg.clock.run_for(600)
        lab=pg.get_attribute('#rskip','aria-label'); s0=pg.evaluate('__G.score')
        pg.screenshot(path=str(shots/f'{n}-board-controls.png'))
        pg.click('#rskip'); pg.clock.run_for(600); pg.evaluate("dispatchEvent(new Event('resize'))"); pg.clock.run_for(100)
        st1=pg.evaluate("[__G.round,__G.state,__G.score]"); strip1=pg.inner_text('.realstrip'); lab2=pg.get_attribute('#rskip','aria-label')
        pg.screenshot(path=str(shots/f'{n}-after-skip-to-dj.png'))
        pg.click('#rskip'); pg.clock.run_for(600)
        st2=pg.evaluate("[__G.round,__G.state,__G.score]"); strip2=pg.inner_text('.realstrip'); has=pg.evaluate("!!document.querySelector('#rskip')")
        pg.screenshot(path=str(shots/f'{n}-after-skip-to-final.png'))
        print(n,'label',lab,'->',st1,'strip',repr(strip1),'| label2',lab2,'->',st2,'strip',repr(strip2),'rskip in final',has,'score start',s0)
        pg.close()
    # header row shorter, values unchanged (report sizes)
    for n,vp,m in (('m390',{'width':390,'height':844},1),('d',{'width':1024,'height':577},0)):
        pg=b.new_page(viewport=vp,is_mobile=bool(m)); pg.clock.install(); pg.goto(u+'?ep=9578'); pg.click('#go'); pg.clock.run_for(600)
        print(n,'cat/cell height',pg.evaluate("[document.querySelector('.cat').getBoundingClientRect().height,document.querySelector('.cell').getBoundingClientRect().height].map(x=>+x.toFixed(1))")); pg.close()
    # end-to-end: new episodes, compare end screen to real final scores
    for ep in NEW:
        e=next(x for x in eps if x['id']==ep)
        pg=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True); hook(pg)
        pg.goto(u+f'?fast=1&auto=1&ep={ep}'); t0=time.time(); pg.wait_for_function("__G.state==='end'",timeout=600000)
        txt=pg.inner_text('#stage'); ok=all((name in txt and money(e['final'][sh]) in txt) for name,sh in e['cons'])
        print(ep,e['show'],e['aired'],'finished',round(time.time()-t0),'s', pg.evaluate('__result'),'| real final',e['final'],'| end screen matches real:',ok)
        pg.screenshot(path=str(shots/f'm-end-screen-{ep}.png')); pg.close()
    b.close()
print('ERRORS',errs)
