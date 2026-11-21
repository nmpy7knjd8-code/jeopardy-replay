"""Play every catalog episode with auto=1&fast=1; check end-screen names+finals."""
import json, pathlib, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from testlib import start_server, ROOT as root
from playwright.sync_api import sync_playwright

KEEP=json.loads((root/'tools'/'keep.json').read_text())
IDS=[str(x) for x in KEEP]

def money(v):
    return ('-' if v<0 else '')+'$'+f'{abs(v):,}'

def work(ids, url, wid):
    results=[]
    with sync_playwright() as p:
        b=p.chromium.launch()
        for ep in ids:
            errs=[]
            pg=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
            pg.on('pageerror',lambda e:errs.append(str(e)))
            t0=time.time()
            try:
                pg.goto(url+f'?fast=1&auto=1&ep={ep}', wait_until='domcontentloaded')
                wanted=pg.evaluate("(id)=>EPISODES.find(e=>e.gameId===id)||{}", ep)
                pg.wait_for_function("__G.state==='end'", timeout=300000)
                txt=pg.inner_text('#stage')
                cons=wanted.get('contestants') or []
                fin=wanted.get('scores',{}).get('Final') or {}
                ok=all((c['name'] in txt and money(fin[c['short']]) in txt) for c in cons)
                res=pg.evaluate('typeof __result!=="undefined"?__result:null')
                rec={'ep':ep,'show':wanted.get('show'),'aired':wanted.get('aired'),'ok':ok,'secs':round(time.time()-t0),'result':res,'final':fin,'errs':errs,'wid':wid}
                if not ok:
                    pg.screenshot(path=str(root/'screenshots'/f'm-end-FAIL-{ep}.png'))
                    rec['txt']=txt[:500]
                results.append(rec)
                print(f"w{wid} {ep} {rec['show']} {'ok' if ok else 'FAIL'} {rec['secs']}s", flush=True)
            except Exception as e:
                rec={'ep':ep,'ok':False,'secs':round(time.time()-t0),'error':repr(e),'errs':errs,'wid':wid}
                results.append(rec)
                print(f"w{wid} {ep} ERROR {e}", flush=True)
                try: pg.screenshot(path=str(root/'screenshots'/f'm-end-FAIL-{ep}.png'))
                except Exception: pass
            finally:
                pg.close()
        b.close()
    return results

def chunks(xs,n):
    xs=list(xs)
    if not xs: return []
    k=(len(xs)+n-1)//n
    return [xs[i:i+k] for i in range(0,len(xs),k)]

if __name__=='__main__':
    url=start_server()
    parts=chunks(IDS, 4)
    print('ids',len(IDS),'workers',len(parts),'sizes',[len(x) for x in parts],'url',url, flush=True)
    out=[]
    with ThreadPoolExecutor(max_workers=len(parts)) as ex:
        futs=[ex.submit(work, p, url, i) for i,p in enumerate(parts)]
        for f in as_completed(futs):
            out.extend(f.result())
    bad=[r for r in out if not r.get('ok')]
    for r in sorted(out, key=lambda x:x['ep']):
        print(r['ep'], r.get('show'), r.get('aired'), 'ok' if r.get('ok') else 'FAIL', r.get('secs'),'s', r.get('result') or r.get('error'), 'final', r.get('final'), 'errs', r.get('errs'), flush=True)
    print('PASS', len(out)-len(bad), 'FAIL', len(bad), flush=True)
    pathlib.Path('/tmp/auto_results.json').write_text(json.dumps(out, indent=2))
    sys.exit(1 if bad else 0)
