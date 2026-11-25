#!/usr/bin/env python3
"""Find a relevant Wikimedia Commons image for each picture clue, download it to media/, record credits.
Usage: fetch_media.py   (reads tools/media_queries.json: {"<gameId>": {"<J|DJ>_<col>_<row>": "search query or File:Title"}})"""
import json, re, sys, time, pathlib, urllib.parse, urllib.request, html
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from media_encode import EXT, encode_bytes
root = pathlib.Path(__file__).resolve().parent.parent
UA = {"User-Agent": "JeopardyReplay/1.0 (personal hobby project; contact: github.com/nmpy7knjd8-code)"}
def get(url):
    import subprocess
    for i in range(3):
        r = subprocess.run(['curl', '-sS', '-f', '-m', '30', '-A', UA['User-Agent'], url], capture_output=True)
        if r.returncode == 0 and r.stdout: return r.stdout
        time.sleep(3 + 4 * i)
    raise RuntimeError(url)
def api(**p):
    p.update(action='query', format='json', prop='imageinfo', iiprop='url|mime|size|extmetadata', iiurlwidth=960)
    return json.loads(get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(p)))
def pages(q):
    if q.startswith('File:'): r = api(titles=q)
    else: r = api(generator='search', gsrsearch=q, gsrnamespace=6, gsrlimit=8)
    ps = sorted(r.get('query', {}).get('pages', {}).values(), key=lambda p: p.get('index', 0))
    out = []
    for p in ps:
        ii = (p.get('imageinfo') or [None])[0]
        if not ii or ii['mime'] not in ('image/jpeg', 'image/png', 'image/svg+xml') or ii['width'] < 400: continue
        out.append((p['title'], ii))
    return out
qs = json.loads((root/'tools/media_queries.json').read_text())
credits = json.loads((root/'media/credits.json').read_text()) if (root/'media/credits.json').exists() else {}
for gid, items in qs.items():
    for key, q in items.items():
        name = f'{gid}-{key}.{EXT}'
        if (root/'media'/name).exists() and name in credits: continue
        idx = 0
        if isinstance(q, list): q, idx = q
        print('query',gid,key,q,flush=True); cands = pages(q); time.sleep(0.6)
        if len(cands) <= idx: print('NO RESULT', gid, key, q); continue
        title, ii = cands[idx]
        try:
          u = ii['thumburl'].split('?')[0].replace('thumb.wikimedia.org', 'upload.wikimedia.org'); data = get(u); time.sleep(0.8)
        except Exception as e:
          print('DL FAIL', name, title); continue
        encode_bytes(data, root/'media'/name)
        md = ii.get('extmetadata', {})
        g = lambda k: html.unescape(re.sub('<[^>]+>', '', md.get(k, {}).get('value', ''))).strip()
        credits[name] = {'title': title, 'author': g('Artist'), 'license': g('LicenseShortName'), 'page': ii['descriptionurl'], 'query': q}
        print(name, '<-', title, '|', len(cands), 'candidates')
        (root/'media/credits.json').write_text(json.dumps(credits, indent=1, ensure_ascii=False))
(root/'media/credits.json').write_text(json.dumps(credits, indent=1, ensure_ascii=False))
