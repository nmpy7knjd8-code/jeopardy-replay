#!/usr/bin/env python3
"""Fetch ONE J! Archive game page (politely) and write src/episodes/<game_id>.json. Personal use only."""
import re, sys, json, pathlib, urllib.request
from bs4 import BeautifulSoup
gid = sys.argv[1]
root = pathlib.Path(__file__).resolve().parent.parent
req = urllib.request.Request(f"https://j-archive.com/showgame.php?game_id={gid}", headers={"User-Agent":"Mozilla/5.0 (personal project; single polite fetch)"})
html = urllib.request.urlopen(req, timeout=30).read().decode()
(pathlib.Path('/tmp')/f'game_{gid}.html').write_text(html)
s = BeautifulSoup(html, 'html.parser')
def txt(el):
    for br in el.find_all('br'): br.replace_with('\n')
    return re.sub(r'[ \t]+', ' ', el.get_text()).strip()
def money(x):
    v = int(re.sub(r'[^\d]', '', txt(x)) or 0)
    return -v if 'negative' in x['class'][0] else v
title = txt(s.find(id='game_title'))
aired = re.search(r'(\w+), (\w+) (\d+), (\d{4})', title)
import datetime
d = datetime.datetime.strptime(' '.join(aired.groups()[1:]), '%B %d %Y').date().isoformat()
show = re.search(r'#(\d+)', title).group(0)
comments = txt(s.find(id='game_comments')) if s.find(id='game_comments') else ''
cons = []
for p in s.select('#contestants p.contestants'):
    a = p.find('a'); name = txt(a); bio = txt(p)[len(name):].lstrip(', ')
    cons.append({'name': name, 'bio': bio})
# score tables
scores = {}
for h in s.find_all('h3'):
    t = txt(h); tb = h.find_next('table')
    if not tb: continue
    names = [txt(x) for x in tb.select('.score_player_nickname')]
    vals = [money(x) for x in tb.select('td[class^=score_positive],td[class^=score_negative]')]
    if not names or len(names) != len(vals): continue
    key = ('J' if t.startswith('Scores at the end of the Jeopardy') else 'DJ' if t.startswith('Scores at the end of the Double') else 'Final' if t.startswith('Final scores') else None)
    if key: scores[key] = dict(zip(names, vals))
nick = list(scores['Final'].keys())
for c, n in zip(sorted(cons, key=lambda c: 0), nick): pass
# contestants appear in the same order as score tables? map by first name
for c in cons:
    c['short'] = next((n for n in nick if c['name'].startswith(n)), None)
assert all(c['short'] for c in cons), (cons, nick)
out = {'show': show, 'aired': d, 'note': comments.replace('\n', ' '), 'contestants': cons, 'scores': scores, 'rounds': {}}
nimg = 0
for rid, key, mult in (('jeopardy_round', 'J', 200), ('double_jeopardy_round', 'DJ', 400)):
    r = s.find(id=rid); cat_tds=r.select('td.category')
    cats = [txt(c.find(class_='category_name')) for c in cat_tds]
    clues = []
    for td in r.select('td.clue'):
        t = td.find('td', class_='clue_text')
        if not t: continue
        m = re.match(r'clue_\w+_(\d+)_(\d+)', t['id']); col, row = int(m.group(1)) - 1, int(m.group(2)) - 1
        val = td.find(class_=re.compile('clue_value')); dd = 'daily' in val['class'][0]
        resp = td.find('td', id=t['id'] + '_r')
        wrong = [txt(x) for x in resp.find_all('td', class_='wrong')]
        c = {'c': col, 'r': row, 'v': (row + 1) * mult, 'dd': dd, 'order': int(td.find(class_='clue_order_number').get_text()),
             'q': txt(t), 'a': txt(resp.find('em', class_='correct_response')), 'right': [txt(x) for x in resp.find_all('td', class_='right')],
             'wrong': [w for w in wrong if w != 'Triple Stumper'], 'stumper': 'Triple Stumper' in wrong, 'img': bool(t.find('a'))}
        if dd: c['ddWager'] = int(re.sub(r'\D', '', val.get_text().replace('DD:', '')))
        nimg += c['img']; clues.append(c)
    out['rounds'][key] = {'cats': cats, 'clues': clues}
fj = s.find(class_='final_round'); t = fj.find('td', id='clue_FJ'); resp = fj.find('td', id='clue_FJ_r')
out['final'] = {'cat': txt(fj.find(class_='category_name')), 'q': txt(t), 'a': txt(resp.find('em')),
  'right': [txt(x) for x in resp.find_all('td', class_='right')], 'wrong': [txt(x) for x in resp.find_all('td', class_='wrong')]}
out['gameId'] = gid
# Host category comments, then generated notes for any blank ones
try:
    from make_cat_notes import fill_episode
    fill_episode(out, html=html)
except Exception as err:
    print('cat_notes skipped:', err)
(root/'src/episodes').mkdir(exist_ok=True)
(root/f'src/episodes/{gid}.json').write_text(json.dumps(out, ensure_ascii=False, indent=1)+'\n')
n = [len(out['rounds'][k]['clues']) for k in 'J DJ'.split()]
print(gid, show, d, comments.replace('\n',' ')[:80]); print([c['name'] for c in cons], 'clues', n, 'img', nimg, 'dd', [sum(c['dd'] for c in out['rounds'][k]['clues']) for k in ('J','DJ')])
print(scores)
