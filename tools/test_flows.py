import pathlib
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':720})
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.goto((root/'index.html').as_uri()+'?fast=1'); pg.click('#go')
    # wrong answer + override, then timeout typing, then DD wager validation
    pg.wait_for_function("__G.state==='open'",timeout=10000); pg.keyboard.press('Space'); pg.wait_for_function("__G.state==='answer'")
    v=pg.evaluate("__G.clue.v"); pg.fill('#ans','zzzz'); pg.keyboard.press('Enter'); pg.wait_for_function("__G.state==='result'")
    print('wrong ->',pg.evaluate("__G.score"),'expected',-v); pg.click('#override'); print('override ->',pg.evaluate("__G.score"))
    pg.click('#next'); pg.wait_for_function("__G.state==='open'",timeout=10000); pg.keyboard.press('Space'); pg.wait_for_function("__G.state==='answer'")
    pg.wait_for_function("__G.state==='result'",timeout=20000); print('timeout verdict:',pg.inner_text('.verdict'),'score',pg.evaluate("__G.score"))
    pg.click('#next')
    pg.evaluate("""()=>{const dd=SHOW.rounds.J.clues.find(c=>c.dd);__G.used=new Set(SHOW.rounds.J.clues.filter(c=>c!==dd).map(c=>c.c+','+c.r));}""")
    pg.wait_for_function("__G.state==='wager'",timeout=10000)
    pg.wait_for_function("document.querySelector('#wg')")
    for bad in ['4','999999','abc']:
        pg.fill('#wg',bad); pg.keyboard.press('Enter'); print('wager',bad,'->',pg.inner_text('#wmsg')[:50],'|',pg.evaluate("__G.state"))
    print(pg.inner_text('.sub'))
    pg.fill('#wg','1000'); pg.keyboard.press('Enter'); pg.wait_for_function("__G.state==='answer'")
    sc=pg.evaluate("__G.score"); a=pg.evaluate("__G.clue.a"); pg.fill('#ans',a); pg.keyboard.press('Enter'); pg.wait_for_function("__G.state==='result'")
    print('DD',sc,'->',pg.evaluate("__G.score"),pg.inner_text('.note'))
    pg.click('#next'); pg.wait_for_function("__G.state==='roundend'",timeout=10000); print(pg.inner_text('table.cmp'))
    pg.click('#cont'); pg.wait_for_function("__G.round==='DJ'")
    # final with negative score
    pg.evaluate("()=>{__G.score=-500}"); 
    b.close()
print('errors',errs)
