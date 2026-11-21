import pathlib, time, json, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from testlib import start_server, ROOT as root
base = sys.argv[1] if len(sys.argv) > 1 else start_server()
shots = root/'screenshots'; shots.mkdir(exist_ok=True)
errs = []
def hook(pg):
    pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append('pageerror ' + str(e)))
    pg.on('requestfailed', lambda r: errs.append('reqfail ' + r.url[-60:]))
def metrics(pg):
    return pg.evaluate("""()=>{const c=document.querySelector('.clue'),t=c.querySelector('.ct'),a=document.querySelector('.banner .cc'),cb=document.querySelector('.ccbox');
      return {font:parseFloat(t.style.fontSize),fits:t.offsetHeight<=c.clientHeight+1&&t.scrollWidth<=c.clientWidth+1,
      catFont:parseFloat(a.style.fontSize),catFits:a.offsetHeight<=cb.clientHeight+1&&a.scrollWidth<=cb.clientWidth+1,
      clueBox:[c.clientWidth,c.clientHeight],pic:!!document.querySelector('.pic img')}}""")
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, vp, mob in (('m', {'width': 390, 'height': 844}, True), ('d', {'width': 1280, 'height': 720}, False)):
        ctx = b.new_context(viewport=vp, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
        pg = ctx.new_page(); hook(pg)
        pg.goto(base + '?fast=1'); pg.wait_for_timeout(600)
        pg.screenshot(path=str(shots/f'{name}-episode-picker.png'))
        pg.locator('.ep').nth(1).click(); pg.locator('.ep').nth(0).click(); pg.click('#go'); pg.wait_for_selector('.board'); pg.wait_for_timeout(500)
        cats = pg.evaluate("[...document.querySelectorAll('.cat')].map(c=>[c.offsetHeight,Math.round(parseFloat(c.firstElementChild.style.fontSize)),c.firstElementChild.scrollWidth<=c.clientWidth,c.firstElementChild.offsetHeight<=c.clientHeight])")
        print(name, 'board cats [h,font,fitW,fitH]:', cats)
        # skip through clues until a picture clue shows up (also exercises skip key)
        seen_plain = seen_pic = False; n = 0
        while n < 30 and not (seen_plain and seen_pic):
            pg.wait_for_function("['reading','open','wager'].includes(__G.state)", timeout=15000)
            if pg.evaluate("__G.state") == 'wager':
                pg.fill('#wg', '1000'); pg.keyboard.press('Enter'); pg.wait_for_selector('.card'); pg.wait_for_timeout(300)
                pg.fill('#ans', 'x'); pg.keyboard.press('Enter'); pg.wait_for_function("__G.state==='result'"); pg.click('#next'); n += 1; continue
            pg.wait_for_timeout(450); m = metrics(pg)
            kind = 'pic' if m['pic'] else 'plain'
            if kind == 'pic' and not seen_pic:
                pg.screenshot(path=str(shots/f'{name}-clue-card-picture.png')); seen_pic = True; print(name, 'pic clue', m)
            if kind == 'plain' and not seen_plain:
                pg.screenshot(path=str(shots/f'{name}-clue-card.png')); seen_plain = True; print(name, 'plain clue', m)
            assert m['fits'] and m['catFits'], m
            pg.keyboard.press('s'); pg.wait_for_function("__G.state==='result'")
            if n == 0: print(name, 'skip result:', pg.inner_text('.verdict'), '| score', pg.evaluate('__G.score'))
            pg.click('#next'); n += 1
        # keyboard simulation: small viewport while typing
        if mob:
            pg.wait_for_function("__G.state==='open'||__G.state==='reading'", timeout=15000)
            pg.wait_for_function("__G.state==='open'"); pg.keyboard.press('Space'); pg.wait_for_function("__G.state==='answer'")
            pg.set_viewport_size({'width': 390, 'height': 450}); pg.wait_for_timeout(500)
            r = pg.evaluate("""()=>{const i=document.querySelector('#ans').getBoundingClientRect(),b=document.querySelector('#bar').getBoundingClientRect(),c=document.querySelector('.clue').getBoundingClientRect(),h=document.querySelector('.banner').getBoundingClientRect();
              return {inputBottom:i.bottom,inputFont:getComputedStyle(document.querySelector('#ans')).fontSize,barBottom:b.bottom,clueH:c.height,bannerTop:h.top,vh:innerHeight,font:parseFloat(document.querySelector('.ct').style.fontSize)}}""")
            print('keyboard-size viewport:', r); assert r['inputBottom'] <= 450 and r['barBottom'] <= 450 and float(r['inputFont'][:-2]) >= 16
            pg.screenshot(path=str(shots/'m-answer-with-keyboard-size.png'))
            pg.set_viewport_size({'width': 390, 'height': 844})
        ctx.close()
    # timing of the buzz window (7 s)
    ctx = b.new_context(viewport={'width': 1280, 'height': 720}); pg = ctx.new_page(); hook(pg)
    pg.goto(base + '?fast=1'); pg.click('#go')
    pg.wait_for_function("__G.state==='open'||__G.state==='wager'", timeout=15000)
    if pg.evaluate("__G.state") == 'open':
        t0 = time.time(); pg.wait_for_function("__G.state==='result'", timeout=15000); print('buzz window seconds ~', round(time.time() - t0, 1))
    ctx.close()
    # all three episodes, auto + fast, mobile viewport
    eps = json.loads(pg.evaluate("1") and '[]') if False else None
    for ep in ('9434', '9402', '9369'):
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); pg = ctx.new_page(); hook(pg)
        pg.goto(base + f'?fast=1&auto=1&ep={ep}'); t0 = time.time()
        pg.wait_for_function("__G.state==='end'", timeout=300000)
        print(ep, 'finished in', round(time.time() - t0), 's ->', pg.evaluate('__result'), '|', pg.inner_text('.h1'))
        pg.screenshot(path=str(shots/f'm-end-screen-{ep}.png'))
        ctx.close()
    b.close()
print('ERRORS:', errs)
