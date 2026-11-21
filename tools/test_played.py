"""Play one episode to the end (no auto/fast), reload, confirm the picker mark. Also home-button confirm."""
import sys, pathlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from testlib import start_server, ROOT as root
from playwright.sync_api import sync_playwright
u=start_server(); shots=root/'screenshots'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':375,'height':667},device_scale_factor=2,is_mobile=True,has_touch=True)
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.clock.install(); pg.goto(u+'?ep=7401'); pg.evaluate('document.fonts.ready'); pg.clock.run_for(300)
    n0=pg.evaluate("[...document.querySelectorAll('.ep.did')].length")
    # home confirm: mid-game, No stays, Yes leaves without recording
    pg.click('#go'); pg.clock.run_for(800); pg.evaluate("dispatchEvent(new Event('resize'))")
    pg.click('#home'); pg.clock.run_for(200)
    assert pg.evaluate("!!document.querySelector('.leave')")
    pg.screenshot(path=str(shots/'m375-leave-confirm.png'))
    pg.click('#leaven'); pg.clock.run_for(200)
    assert pg.evaluate("__G.state!=='intro' && !document.querySelector('.leave')")
    # finish via round-skip to end (score 0)
    pg.click('#rskip'); pg.clock.run_for(800)
    pg.click('#rskip'); pg.clock.run_for(800)
    if pg.evaluate("__G.state")=='finalwager':
        if pg.query_selector('#cont'): pg.click('#cont')
        pg.clock.run_for(400)
    pg.wait_for_function("__G.state==='end'", timeout=20000)
    stored=pg.evaluate("__readPlayed()")
    print('stored after end', stored)
    # home from end (no confirm) then picker mark
    pg.click('#home'); pg.clock.run_for(400)
    # reload to confirm persistence
    pg.goto(u+'?ep=7401'); pg.evaluate('document.fonts.ready'); pg.clock.run_for(400)
    info=pg.evaluate("""()=>{const b=[...document.querySelectorAll('.ep')].find(e=>e.textContent.includes('#8674')||e.textContent.includes('8674'));
      return b?{did:b.classList.contains('did'),text:b.innerText,played:b.querySelector('.played')&&b.querySelector('.played').textContent}:null}""")
    print('picker after reload', info)
    pg.screenshot(path=str(shots/'m375-episode-picker-played.png'))
    # expand season menu
    pg.click('#ssel'); pg.clock.run_for(200)
    pg.screenshot(path=str(shots/'m375-episode-picker-seasons.png'))
    d=b.new_page(viewport={'width':1024,'height':577})
    d.goto(u); d.evaluate('document.fonts.ready'); d.wait_for_timeout(300)
    d.screenshot(path=str(shots/'d-episode-picker.png'))
    d.click('#ssel'); d.wait_for_timeout(200)
    d.screenshot(path=str(shots/'d-episode-picker-seasons.png'))
    # corner crop from a board
    c=b.new_page(viewport={'width':375,'height':667},device_scale_factor=2,is_mobile=True,has_touch=True)
    c.clock.install(); c.goto(u+'?ep=9434'); c.click('#go'); c.clock.run_for(800)
    c.screenshot(path=str(shots/'m375-board-controls.png'))
    box=c.evaluate("()=>{const r=document.querySelector('#hud').getBoundingClientRect();return {y:r.y,h:r.height,w:innerWidth}}")
    print('hud',box)
    print('ERRORS',errs,'marked',n0,'->',info)
    assert stored.get('7401',{}).get('finished') and stored['7401']['best']==0
    assert info and info['did'] and '$0' in info['played']
