#!/usr/bin/env python3
"""Renders the gold-J-on-Jeopardy-blue app icon (needs playwright+chromium, Pillow)."""
import pathlib, io
from playwright.sync_api import sync_playwright
from PIL import Image
root = pathlib.Path(__file__).resolve().parent.parent
font = (root/'fonts/LibreBaskerville-700.woff2').as_uri()
html = f"""<html><style>
@font-face{{font-family:LB;src:url({font});font-weight:700}}
html,body{{margin:0;background:#060CE9}}
#i{{width:1024px;height:1024px;position:relative;overflow:hidden;
 background:radial-gradient(circle at 50% 30%,#2a31ff 0%,#060CE9 48%,#03068a 100%)}}
#i:before{{content:'';position:absolute;inset:36px;border-radius:150px;border:6px solid rgba(255,255,255,.10);box-shadow:inset 0 0 120px rgba(0,0,60,.55)}}
#j{{position:absolute;left:0;right:0;top:50%;transform:translateY(-52%);text-align:center;font:700 800px/1 LB,Georgia,serif;
 background:linear-gradient(180deg,#fff0a6 0%,#ffd45a 38%,#e0a21f 72%,#a8700c 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
 filter:drop-shadow(0 14px 0 #5a3c05) drop-shadow(0 34px 38px rgba(0,0,30,.7))}}
</style><body><div id=i><div id=j>J</div></div></body></html>"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width':1024,'height':1024})
    pg.set_content(html); pg.wait_for_timeout(500); pg.evaluate("document.fonts.ready")
    pg.wait_for_timeout(300)
    png = pg.screenshot(clip={'x':0,'y':0,'width':1024,'height':1024}); b.close()
im = Image.open(io.BytesIO(png)).convert('RGB')
for name, s in [('apple-touch-icon.png',180),('icon-192.png',192),('icon-512.png',512),('favicon-32.png',32)]:
    im.resize((s,s), Image.LANCZOS).save(root/name, optimize=True)
im.resize((256,256), Image.LANCZOS).save(root/'favicon.ico', sizes=[(16,16),(32,32),(48,48)])
print('ok')
