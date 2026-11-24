#!/usr/bin/env python3
"""Fill episode JSON cat_notes: J! Archive host comments when present, else a short theme/wordplay note.

Never names a specific clue answer. Safe to re-run; keeps a host comment over a generated one.
"""
from __future__ import annotations
import json, re, sys, pathlib
from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parent.parent
TMP = pathlib.Path('/tmp')
HOST_WRAP = re.compile(
    r'^\(\s*(?:Alex|Ken|Johnny|Mayim|Trebek|Jennings|the host)[^:]*:\s*(.*?)\s*\)\s*$',
    re.I | re.S,
)
QUOTES = re.compile(r'["“”](.+?)["“”]')
VOWELS = set('aeiou')

def txt(el):
    if not el:
        return ''
    for br in el.find_all('br'):
        br.replace_with(' ')
    return re.sub(r'\s+', ' ', el.get_text()).strip()

def clean_host(raw: str) -> str:
    t = re.sub(r'\s+', ' ', raw or '').strip()
    if not t:
        return ''
    m = HOST_WRAP.match(t)
    if m:
        t = m.group(1).strip()
    if t and t[0].islower():
        t = t[0].upper() + t[1:]
    if t and t[-1] not in '.!?':
        t += '.'
    return t

def parse_host_html(html: str):
    """Return {'J':[6], 'DJ':[6], 'F': str} of cleaned host comments (empty if none)."""
    s = BeautifulSoup(html, 'html.parser')
    def comments_in(root, n):
        if not root:
            return [''] * n
        out = []
        for c in root.select('td.category'):
            out.append(clean_host(txt(c.find(class_='category_comments'))))
        # boards include only category cells of that table
        return (out + [''] * n)[:n]
    j = s.find(id='jeopardy_round')
    dj = s.find(id='double_jeopardy_round')
    fj = s.find(class_='final_round')
    J = comments_in(j, 6)
    DJ = comments_in(dj, 6)
    F = ''
    if fj:
        F = clean_host(txt(fj.find(class_='category_comments')))
    return {'J': J, 'DJ': DJ, 'F': F}

def norm(s: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', (s or '').lower())

def core_answer(s: str) -> str:
    """Main phrase of an answer, ignoring trailing parentheticals or place tags."""
    s = re.sub(r'\([^)]*\)', ' ', s or '')
    s = s.split(',')[0]
    return s.strip()

def words(s: str):
    return re.findall(r'[a-z0-9]+', (s or '').lower())

def clues_in(rd, col):
    return [c for c in rd.get('clues', []) if c.get('c') == col]

def answers_of(clues):
    return [c.get('a') or '' for c in clues]

SMALL = {'a','an','and','at','by','for','from','in','of','on','or','the','to','vs','vs.','with'}
KEEP = {'U.S.','U.S.A.','U.K.','TV','FDR','JFK','MLB','NBA','NFL','NHL','NASA','USSR',
        'WWII','WWI','D.C.','R&B','A&E','OK','NY','LA','DC','UK','USA','UN','EU','OSCAR','EGOT'}

def tidy(title: str) -> str:
    t = re.sub(r'\s+', ' ', (title or '').replace('&', ' and ')).strip()
    parts = []
    raw = t.split(' ')
    for i,w in enumerate(raw):
        bare = w.strip(".,!?:;'")
        up = bare.upper()
        if up in KEEP or bare in KEEP or ('.' in bare and len(bare) <= 6 and bare.replace('.', '').isalpha()):
            parts.append(bare if bare in KEEP or up in KEEP else w)
        elif re.fullmatch(r'\d+-LETTER', w, re.I):
            parts.append(w.lower())
        else:
            low = bare.lower()
            # preserve a trailing comma or similar glued to the token
            tail = w[len(w.rstrip(".,!?:;")):] if w.endswith((',',';',':')) else ''
            if i > 0 and i < len(raw)-1 and low in SMALL:
                parts.append(low+tail)
            elif i>0 and raw[i-1].endswith(',') and low in {'aye','oh','ah','ha','huh'}:
                parts.append(low+tail)
            else:
                parts.append((low[:1].upper()+low[1:] if low else w)+tail)
    return ' '.join(parts)

def is_plain_topic(title: str) -> bool:
    if QUOTES.search(title):
        return False
    if re.search(r'[!?]', title):
        return False
    if re.search(r"\b(IT'?S|I'M|LET'?S|I |YOU |WE |THEY |STUFF I|ONLY A)\b", title, re.I):
        return False
    if re.search(r'\b(BETWEEN|BEFORE|AFTER|RHYME|ANAGRAM|SCRAMBL|HOMOPHON|POTPOURRI|POURRI|HODGEPODGE|GRAB BAG|CROSSWORD|ALLITERATION|STARTS WITH|ENDS WITH|ENDS IN|ENDING IN|SILENT|VOWEL|CONSONANT|SYLLABLE)\b', title, re.I):
        return False
    return True

def theme_sentence(title: str) -> str:
    pretty = tidy(title)
    if is_plain_topic(title):
        if re.match(r'^(from|in|on|at|of|for|to|with)\b', pretty, re.I):
            return f'Clues {pretty[0].lower()+pretty[1:]}.'
        return f'Clues about {pretty}.'
    return (f'The category “{title}” sets the theme — the clues follow that idea '
            f'and any wordplay suggested by the title.')

def qbits(title: str):
    return [b.strip() for b in QUOTES.findall(title) if b.strip()]

def all_contain(ans, s):
    n = norm(s)
    return bool(n) and all(n in norm(a) for a in ans)

def all_start(ans, s):
    n = norm(s)
    return bool(n) and all(norm(core_answer(a)).startswith(n) for a in ans)

def all_end(ans, s):
    n = norm(s)
    return bool(n) and all(norm(core_answer(a)).endswith(n) for a in ans)

def first_letters(ans):
    out = []
    for a in ans:
        w = words(a)
        if w and w[0] in {'a', 'an', 'the'} and len(w) > 1:
            w = w[1:]
        out.append(w[0][0] if w else '')
    return out

def last_name_letters(ans):
    out = []
    for a in ans:
        w = words(re.sub(r'\([^)]*\)', ' ', a))
        if w and w[0] in {'a', 'an', 'the'} and len(w) > 1:
            w = w[1:]
        out.append(w[-1][0] if w else '')
    return out

def explain_quoted(title, ans) -> str | None:
    bits = qbits(title)
    if not bits or not ans:
        return None
    # FROM "A" TO "Y"
    m = re.search(r'FROM\s+["“”](.+?)["“”]\s+TO\s+["“”](.+?)["“”]', title, re.I)
    if m and all_start(ans, m.group(1)) and all_end(ans, m.group(2)):
        return (f'Each answer starts with “{m.group(1)}” and ends with “{m.group(2)}”.')
    if len(bits) == 2:
        a, b = bits
        if all_contain(ans, a) and all_contain(ans, b):
            return f'Each answer contains both “{a}” and “{b}”.'
        if all_start(ans, a) and all_end(ans, b):
            return f'Each answer starts with “{a}” and ends with “{b}”.'
    # "U"3  /  "U" 3 — N copies of a letter group
    m = re.search(r'["“”](.+?)["“”]\s*[x×]?\s*(\d+)\b', title, re.I)
    if m:
        tok, n = m.group(1), int(m.group(2))
        nt = norm(tok)
        if nt and all(norm(a).count(nt) >= n for a in ans):
            return f'Each answer contains the letter group “{tok}” at least {n} times.'
    if len(bits) != 1:
        # several quoted fragments going down the column (rare without a host note)
        if len(bits) >= 3:
            return ('The quotation marks flag letter groups that begin each answer, '
                    'going down the category.')
        return None
    tok = bits[0]
    nt = norm(tok)
    if not nt:
        return None
    # initials like "J.P." or "T.W."
    if re.fullmatch(r'[A-Za-z](?:\.[A-Za-z])+\.?', tok):
        letters = re.findall(r'[A-Za-z]', tok)
        def has_init(a):
            ws = words(re.sub(r'\([^)]*\)', ' ', a))
            if ws and ws[0] in {'a', 'an', 'the'} and len(ws) > 1:
                ws = ws[1:]
            if len(ws) >= len(letters) and all(ws[i][0] == letters[i].lower() for i in range(len(letters))):
                return True
            # tight letters in the normalized answer (JP, TW)
            return ''.join(letters).lower() in norm(a)
        if all(has_init(a) for a in ans):
            shown = '.'.join(letters) + '.'
            return f'Each answer is formed from the initials {shown.rstrip(".")}.'
    crossword = bool(re.search(r'CROSSWORD', title, re.I))
    starts = all_start(ans, tok)
    ends = all_end(ans, tok)
    contains = all_contain(ans, tok)
    # "Y" IS THE ONLY VOWEL
    if re.search(r'ONLY VOWEL', title, re.I) and len(nt) == 1:
        def only_vowel(a):
            letters = [ch for ch in norm(a) if ch.isalpha()]
            vows = [ch for ch in letters if ch in VOWELS or ch == nt]
            # y sometimes counts; require nt is the only aeiou/y depending
            aeio = [ch for ch in letters if ch in VOWELS]
            return len(aeio) == 0 and nt in letters
        if all(only_vowel(a) for a in ans):
            return f'In each answer, “{tok}” is the only vowel.'
    if starts and not (ends and len(nt) > 1 and nt == norm(ans[0])[:len(nt)] and all_end(ans, tok) and starts):
        # prefer "starts with" when every answer begins with the group
        msg = f'Each answer starts with “{tok}”.'
        if crossword:
            msg = f'Crossword-style clues; each answer starts with “{tok}”.'
        return msg
    if ends and not starts:
        msg = f'Each answer ends with “{tok}”.'
        if crossword:
            msg = f'Crossword-style clues; each answer ends with “{tok}”.'
        return msg
    if contains:
        if crossword:
            return f'Crossword-style clues; each answer contains “{tok}”.'
        if len(nt) == 1:
            # might be last-name initial ( "R" MAN )
            ln = last_name_letters(ans)
            fl = first_letters(ans)
            if all(x == nt for x in ln) and not all(x == nt for x in fl):
                return f'Each answer is a person or name associated with the letter “{tok}”.'
            return f'Each answer contains the letter “{tok}”.'
        return f'Each answer contains the letter group “{tok}”.'
    # last-name / first-word letter when not contained after stripping punctuation
    fl, ln = first_letters(ans), last_name_letters(ans)
    if len(nt) == 1 and all(x == nt for x in fl):
        return f'Each answer starts with the letter “{tok}”.'
    if len(nt) == 1 and all(x == nt for x in ln):
        return f'Each answer is a name that starts with “{tok}”.'
    if crossword:
        return f'Crossword-style clues with a “{tok}” hook — the answers follow that letter.'
    return None

def title_word_hits(title, ans):
    stop={'a','an','the','and','or','of','for','to','in','on','at','it','its','s','with','from'}
    hits=[]
    for w in words(title):
        if w in stop or len(w)<3:
            continue
        c=sum(1 for a in ans if w in norm(a) or w in a.lower())
        if ans and c>=max(3, len(ans)-1):
            hits.append(w)
    return hits

def explain_mechanic(title: str, ans: list[str]) -> str | None:
    if not title:
        return None
    # "S"EVEN-LETTER — pun on SEVEN-LETTER, answers start with the quoted letter
    m = re.search(r'["“”]([A-Za-z])["“”]\s*EVEN[- ]?LETTER\s*(.*)$', title, re.I)
    if m:
        letter, rest = m.group(1), m.group(2).strip(' -–')
        msg = f'Each answer is a 7-letter word starting with “{letter}”'
        if rest:
            msg += f', and the clues are about {tidy(rest)}'
        return msg + '.'
    if re.search(r'POURRI$', title, re.I):
        head = re.sub(r'[- ]?POURRI$', '', title, flags=re.I).strip()
        if head:
            return f'A mixed potpourri of {tidy(head)}-related clues.'
        return 'A mixed potpourri of clues on assorted topics.'
    m = re.search(r'^TIME FOR (?:AN?\s+)?(.+)$', title, re.I)
    if m:
        thing = tidy(m.group(1))
        thing = re.sub(r'^(An?|The)\s+', '', thing, flags=re.I)
        if thing and not thing.endswith(('s','ss','sh','ch','x','z')):
            # regular plural for a simple noun like "snack"
            if ' ' not in thing:
                thing = thing + 's'
        return f'Clues about {thing[0].lower()+thing[1:]}.'
    # BETWEEN X & Y (only when answers really sit between those two dictionary words)
    m = re.search(r'BETWEEN\s+(.+?)\s+(?:&|AND)\s+(.+)$', title, re.I)
    if m:
        a = re.sub(r'["“”]', '', m.group(1)).strip()
        b = re.sub(r'["“”]', '', m.group(2)).strip()
        # drop a leading "A NUMBER" style prefix already consumed... groups are the two bounds
        # "A NUMBER BETWEEN 3 & 5" → a="3", b="5"
        lo, hi = sorted([norm(a), norm(b)])
        if ans and lo and hi and all(lo < norm(core_answer(x)) < hi for x in ans):
            return (f'Each answer is a word that falls alphabetically between '
                    f'“{a.lower()}” and “{b.lower()}” in the dictionary.')
        if re.fullmatch(r'\d+(?:\.\d+)?', a) and re.fullmatch(r'\d+(?:\.\d+)?', b):
            return (f'Each answer involves a number that falls between {a} and {b}.')
    if re.search(r'BEFORE\s*(?:&|AND)\s*AFTER', title, re.I):
        return ('Each answer is a “before and after”: two familiar phrases fused '
                'by a word or name they share.')
    if re.search(r'\bRHYME', title, re.I):
        return 'Each answer is a rhyming word or phrase.'
    if re.search(r'HOMOPHON|SOUND[S]?\s+ALIKE|SOUNDS LIKE', title, re.I):
        return 'The answers involve homophones — words that sound alike but differ in meaning or spelling.'
    if re.search(r'\bANAGRAM|SCRAMBL|MIXED[- ]UP LETTERS|LETTER BANK', title, re.I):
        return 'Each answer is formed by rearranging letters from a word or name in the clue.'
    if re.search(r'\bALLITERATION\b', title, re.I):
        return 'Each answer is alliterative — its main words start with the same sound.'
    if re.search(r'ONE[- ]SYLLABLE|ALL ONE SYLLABLE|MONOSYLLAB', title, re.I):
        return 'Each answer is made of one-syllable words.'
    m = re.search(r'(\d+)[- ]LETTER', title, re.I)
    if m:
        n = int(m.group(1))
        topic = re.sub(r'\d+[- ]LETTER WORDS?', '', title, flags=re.I).strip(' -–&')
        if topic:
            return f'Each answer is a {n}-letter word or term related to {tidy(topic)}.'
        return f'Each answer is a {n}-letter word.'
    if re.search(r'POTPOURRI|HODGEPODGE|GRAB BAG|STEW$|MIXED BAG|LEFTOVERS', title, re.I):
        return 'A mixed bag of clues with no single topic.'
    if re.search(r'CROSSWORD', title, re.I) and not qbits(title):
        return 'Crossword-style clues: a short definition plus a letter pattern for the answer.'
    m = re.search(r'(?:STARTS|BEGINS)\s+WITH\s+(?:AN?\s+)?(.+)$', title, re.I)
    if m:
        hook = m.group(1).strip()
        quoted = qbits(hook)
        if quoted:
            hook = quoted[0]
            if re.search(r'SILENT', title, re.I):
                return f'Each answer starts with a silent “{hook}”.'
            if all_start(ans, hook) or all_contain(ans, hook) or not ans:
                return f'Each answer starts with “{hook}”.'
        if re.search(r'SILENT LETTER', hook, re.I):
            return 'Each answer starts with a silent letter.'
        if re.search(r'SILENT', hook, re.I):
            tok = qbits(title)
            if tok:
                return f'Each answer starts with a silent “{tok[0]}”.'
            return 'Each answer starts with a silent letter.'
        if re.search(r'CONSONANT', hook, re.I):
            n = re.search(r'(\d+)', hook)
            if n:
                return f'Each answer starts with {n.group(1)} consonants in a row.'
            return 'Each answer starts with a consonant cluster or a named kind of opening letters.'
        if re.search(r'CONJUNCTION', hook, re.I):
            return 'Each answer starts with a conjunction (a word such as and, but, or or).'
        if re.search(r'SEASONING|SPICE|HERB', hook, re.I):
            return 'Each answer starts with the name of a seasoning.'
        return f'Each answer starts with {tidy(hook)}.'
    m = re.search(r'(?:ENDS\s+WITH|ENDS\s+IN|ENDING\s+IN)\s+(?:AN?\s+)?(.+)$', title, re.I)
    if m:
        hook = m.group(1).strip()
        quoted = qbits(hook)
        if quoted:
            hook = quoted[0]
            if re.search(r'SILENT', title, re.I):
                return f'Each answer ends with a silent “{hook}”.'
            return f'Each answer ends with “{hook}”.'
        if re.search(r'SILENT', hook, re.I):
            tok = qbits(title)
            if tok:
                return f'Each answer ends with a silent “{tok[0]}”.'
            return 'Each answer ends with a silent letter.'
        return f'Each answer ends with {tidy(hook)}.'
    # quoted hook
    q = explain_quoted(title, ans)
    if q:
        # add a topic hint when the rest of the title is a real subject (e.g. "C" IN SCIENCE)
        rest = QUOTES.sub(' ', title)
        rest = re.sub(r'\s+', ' ', rest).strip(' -–,/')
        topic = tidy(rest)
        if rest and is_plain_topic(rest) and len(re.sub(r'[^a-z0-9]+','', topic.lower())) >= 4 and not re.search(
            r"^(the|a|an|in|of|and|for|to|from|from to|it'?s|it'?s up to|up to|this|on|at|world|man|stuff|words?|steer|zone|habits|please|whiz|mart)$",
            topic, re.I
        ) and not re.search(r'^(the|a|an)\s+\w+$', topic, re.I):
            if topic.lower() not in q.lower():
                return q.rstrip('.') + f', and the clues are about {topic}.'
        return q
    return None

def explain_category(title: str, clues: list) -> str:
    ans = answers_of(clues)
    mech = explain_mechanic(title, ans)
    if mech:
        return mech
    hits = title_word_hits(title, ans)
    stop={'a','an','the','and','or','of','for','to','in','on','at','it','its','s','with','from'}
    toks=[w for w in words(title) if w not in stop and len(w)>=3]
    if hits and toks and set(hits) != set(toks):
        noun = hits[0]
        return f'Clues about {noun}s, riffing on the title “{title}”.'
    return theme_sentence(title)

def fill_episode(ep: dict, html: str | None = None, html_path: pathlib.Path | None = None) -> dict:
    host = {'J': [''] * 6, 'DJ': [''] * 6, 'F': ''}
    if html is None and html_path is None:
        gid = str(ep.get('gameId') or '')
        p = TMP / f'game_{gid}.html'
        if p.exists():
            html_path = p
    if html is None and html_path is not None and html_path.exists():
        html = html_path.read_text(errors='replace')
    if html:
        host = parse_host_html(html)
    notes = {'J': [], 'DJ': [], 'F': ''}
    for rnd in ('J', 'DJ'):
        rd = ep.get('rounds', {}).get(rnd, {})
        cats = rd.get('cats') or []
        row = []
        for i, title in enumerate(cats):
            h = (host.get(rnd) or ['']) 
            h = h[i] if i < len(h) else ''
            if h:
                row.append(h)
            else:
                row.append(explain_category(title, clues_in(rd, i)))
        # pad to 6 if needed
        while len(row) < 6:
            row.append('')
        notes[rnd] = row[:6]
    fh = host.get('F') or ''
    ft = (ep.get('final') or {}).get('cat') or ''
    notes['F'] = fh if fh else (explain_category(ft, [{'a': (ep.get('final') or {}).get('a', '')}]) if ft else '')
    ep['cat_notes'] = notes
    return ep

def fill_file(path: pathlib.Path) -> dict:
    ep = json.loads(path.read_text())
    fill_episode(ep)
    path.write_text(json.dumps(ep, ensure_ascii=False, indent=1) + '\n')
    return ep['cat_notes']

def main(argv):
    if len(argv) > 1:
        paths = [pathlib.Path(a) for a in argv[1:]]
    else:
        paths = sorted((ROOT / 'src/episodes').glob('*.json'), key=lambda p: int(p.stem) if p.stem.isdigit() else p.stem)
    n = 0
    hosts = 0
    for p in paths:
        notes = fill_file(p)
        n += 1
        hosts += sum(1 for r in ('J', 'DJ') for t in notes[r] if t) + (1 if notes.get('F') else 0)
        # count only doesn't distinguish host vs gen
    print(f'filled {n} episodes')

if __name__ == '__main__':
    main(sys.argv)
