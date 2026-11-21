from playwright.sync_api import sync_playwright
import pathlib
root=pathlib.Path(__file__).resolve().parent.parent
import sys; sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from testlib import start_server
u=start_server()
with sync_playwright() as p:
    b=p.chromium.launch()
    for n,vp,m in (('m',{'width':390,'height':844},1),('m375',{'width':375,'height':667},1),('d',{'width':1024,'height':577},0)):
        pg=b.new_page(viewport=vp,device_scale_factor=2 if m else 1,is_mobile=bool(m),has_touch=bool(m))
        pg.clock.install(); pg.goto(u+'?ep=9434'); pg.click('#go'); pg.wait_for_selector('#set'); pg.evaluate('document.fonts.ready'); pg.clock.run_for(500); pg.evaluate("dispatchEvent(new Event('resize'))"); pg.clock.run_for(100)
        pg.screenshot(path=str(root/f'screenshots/{n}-board.png'))
        pg.evaluate("__startRound('DJ')"); pg.clock.run_for(500); pg.evaluate("dispatchEvent(new Event('resize'))"); pg.clock.run_for(100)
        pg.screenshot(path=str(root/f'screenshots/{n}-board-dj.png'))
