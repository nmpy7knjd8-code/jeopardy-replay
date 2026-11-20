#!/usr/bin/env python3
"""Regenerate media/CREDITS.md from media/credits.json."""
import json, pathlib
r = pathlib.Path(__file__).resolve().parent.parent
c = json.loads((r/'media/credits.json').read_text())
L = ["# Image credits", "", "Clue pictures are from Wikimedia Commons (each under its own license; see the linked file page for author and terms). They are illustrative stand-ins for the pictures shown on TV.", "", "| File | Source | Author | License |", "|---|---|---|---|"]
for k in sorted(c):
    if not (r/'media'/k).exists(): continue
    v = c[k]; t = v['title'].replace('File:', ''); a = (v['author'] or 'unknown').replace('|', '/').replace('\n', ' ')[:80]
    L.append(f"| {k} | [{t}]({v['page']}) | {a} | {v['license'] or 'see page'} |")
(r/'media/CREDITS.md').write_text('\n'.join(L) + '\n'); print(len(L) - 6, 'credits')
