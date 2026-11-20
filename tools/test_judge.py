import pathlib
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
cases=[("what is a snowplow","a snowplow",1),("snow plow","a snowplow",1),("Who is Wilde?","Oscar Wilde",0),("lady windermeres fan","Lady Windermere's Fan",1),
("Lady Windermere's Fann","Lady Windermere's Fan",1),("afrikaans and zulu","Afrikaans & Zulu",1),("zulu & afrikaans","Afrikaans & Zulu",1),
("what is the warsaw pact","Warsaw Pact",1),("warsaw pakt","Warsaw Pact",1),("pact","Warsaw Pact",0),("dna","DNA",1),("dnb","DNA",0),("cat","car",0),
("ten","(the) 10",1),("fink","Fink",1),("finch","Fink",0),("what's palm tree","a palm tree",1),("","x",0),("john","King John",0),
("Oscar Wilde","(Oscar) Wilde",1),("Wilde","(Oscar) Wilde",1),("Zürich","Zurich",1),("elephants","elephant",1)]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); pg.goto((root/'index.html').as_uri())
    bad=0
    for u,a,e in cases:
        r=int(pg.evaluate("([u,a])=>__judge(u,a)",[u,a]))
        if r!=e: bad+=1; print('MISMATCH',repr(u),repr(a),'got',r,'want',e)
    print('judge ok' if not bad else f'{bad} mismatches')
