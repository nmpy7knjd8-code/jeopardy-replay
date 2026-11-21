import sys, pathlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from testlib import start_server, ROOT as root
from playwright.sync_api import sync_playwright
from PIL import Image
u=start_server(); shots=root/'screenshots'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for n,vp,m in (('m375',{'width':375,'height':667},1),('m',{'width':390,'height':844},1),('d',{'width':1024,'height':577},0)):
        pg=b.new_page(viewport=vp,device_scale_factor=2 if m else 1,is_mobile=bool(m),has_touch=bool(m))
        pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.clock.install(); pg.goto(u); pg.evaluate('document.fonts.ready'); pg.clock.run_for(400)
        pg.screenshot(path=str(shots/f'{n}-episode-picker.png'))
        pg.click('#ssel'); pg.clock.run_for(250)
        pg.screenshot(path=str(shots/f'{n}-episode-picker-seasons.png'))
        pg.click('#ssel'); pg.clock.run_for(100)  # close? toggle
        # open a mid season via menu if still open, else reopen
        if pg.evaluate("document.querySelector('#smenu').classList.contains('hide')"):
            pg.click('#ssel'); pg.clock.run_for(200)
        # click Season 30 if present
        pg.locator('.sitem', has_text='Season 30').click(); pg.clock.run_for(200)
        pg.screenshot(path=str(shots/f'{n}-episode-picker-s30.png'))
        if n in ('m375','d'):
            pg.goto(u+'?ep=9434'); pg.click('#go'); pg.clock.run_for(800); pg.evaluate("dispatchEvent(new Event('resize'))"); pg.clock.run_for(100)
            pg.screenshot(path=str(shots/f'{n}-board-controls.png'))
        pg.close()
    print('ERR',errs)

# crop corners from board-controls
for name in ('m375-board-controls.png','d-board-controls.png'):
    im=Image.open(shots/name); w,h=im.size
    im.crop((0,int(h*0.72),w,h)).save(shots/f'corner-controls-{name.split("-")[0]}.png')
    print('cropped', name, im.size)
