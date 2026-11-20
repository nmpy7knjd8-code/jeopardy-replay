import json,sys,pathlib
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
url=(root/'index.html').as_uri()
shots=root/'screenshots'
errs=[]
def hook(pg):
    pg.on('console',lambda m: errs.append(('console',m.text)) if m.type in('error','warning') else None)
    pg.on('pageerror',lambda e: errs.append(('pageerror',str(e))))
with sync_playwright() as p:
    b=p.chromium.launch()
    # 1) manual play: normal timings
    pg=b.new_page(viewport={'width':1280,'height':720}); hook(pg)
    pg.goto(url); pg.wait_for_timeout(500); pg.screenshot(path=str(shots/'0-intro.png'))
    pg.click('#go'); pg.wait_for_selector('.board'); pg.wait_for_timeout(300)
    pg.screenshot(path=str(shots/'1-board.png'))
    # clue 1: early buzz => lockout, then proper buzz
    pg.wait_for_selector('.card',timeout=8000); pg.wait_for_timeout(400)
    pg.keyboard.press('Space'); pg.wait_for_timeout(100)
    print('early:',pg.evaluate("__G.state"), pg.inner_text('.hint'))
    pg.screenshot(path=str(shots/'2-clue-card.png'))
    pg.wait_for_function("__G.state==='open'",timeout=20000)
    pg.wait_for_timeout(300); pg.screenshot(path=str(shots/'3-buzzers-open.png'))
    pg.keyboard.press('Space'); pg.wait_for_function("__G.state==='answer'")
    ans=pg.evaluate("__G.clue.a"); print('clue:',pg.evaluate("__G.clue.q")[:60],'|',ans)
    pg.fill('#ans','what is '+ans.lower().replace('(','').replace(')','')); pg.keyboard.press('Enter')
    pg.wait_for_function("__G.state==='result'"); print('score',pg.evaluate("__G.score"))
    pg.screenshot(path=str(shots/'4-result.png'))
    # clue 2: don't buzz at all
    pg.click('#next'); pg.wait_for_function("__G.state==='reading'",timeout=8000)
    pg.wait_for_function("__G.state==='result'",timeout=20000); print('nobuzz note:',pg.inner_text('.note'),'score',pg.evaluate("__G.score"))
    # clue 3: wrong answer + override
    pg.click('#next'); pg.wait_for_function("__G.state==='open' || __G.state==='wager'",timeout=15000)
    if pg.evaluate("__G.state")=='open':
        pg.keyboard.press('Space'); pg.wait_for_function("__G.state==='answer'")
        pg.fill('#ans','zzz'); pg.keyboard.press('Enter'); pg.wait_for_function("__G.state==='result'")
        s0=pg.evaluate("__G.score"); pg.click('#override'); print('override',s0,'->',pg.evaluate("__G.score"))
    pg.close()
    # 2) fast autoplay full game
    pg=b.new_page(viewport={'width':1280,'height':720}); hook(pg)
    pg.goto(url+'?fast=1&auto=1')
    seen=set()
    import time; t0=time.time()
    while pg.evaluate("__G.state")!='end' and time.time()-t0<240:
        st=pg.evaluate("__G.state+'|'+__G.round")
        if st not in seen:
            seen.add(st)
            if st.endswith('|DJ') and st.startswith('board'): pg.screenshot(path=str(shots/'5-double-jeopardy-board.png'))
            if st.startswith('ddsplash'): pg.screenshot(path=str(shots/'6-daily-double.png'))
            if st.startswith('roundend|J'): pg.screenshot(path=str(shots/'7-round-end.png'))
            if st.startswith('finalwager'): pg.screenshot(path=str(shots/'8-final-category.png'))
        pg.wait_for_timeout(40)
    pg.wait_for_timeout(400); pg.screenshot(path=str(shots/'9-end-screen.png'))
    print('end:',pg.evaluate("__result"), 'used states',sorted(seen))
    pg.close()
    # 3) mobile portrait
    pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2,has_touch=True,is_mobile=True); hook(pg)
    pg.goto(url+'?fast=1'); pg.click('#go'); pg.wait_for_selector('.board'); pg.screenshot(path=str(shots/'m1-board.png'))
    pg.wait_for_function("__G.state==='open'||__G.state==='wager'",timeout=15000)
    if pg.evaluate('__G.state')=='wager': pg.screenshot(path=str(shots/'m3-wager.png')); pg.evaluate("()=>{__G.wagerGo&&0}"); pg.fill('#wg','1000'); pg.keyboard.press('Enter'); pg.wait_for_selector('.card')
    else: pg.wait_for_timeout(200)
    pg.screenshot(path=str(shots/'m2-clue.png'))
    b.close()
print('ERRORS:',errs)
