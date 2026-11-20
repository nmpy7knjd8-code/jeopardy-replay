# 🎬 Jeopardy! Replay

## ▶️ **Play it: https://nmpy7knjd8-code.github.io/jeopardy-replay/**

A simple personal web app that lets you play through a **real *Jeopardy!* episode** — Jeopardy round, Double Jeopardy, Daily Doubles and Final Jeopardy — and then compares your score with the real contestants.

Six real episodes are included (pick one on the start screen):

| Aired | Show | Contestants | Real final scores |
|---|---|---|---|
| 2026-11-16 | #9661 (Will Goree's 5th game) | Kali Sluyter · Will Goree · Josh Luiza | $2,200 · $1,000 · $0 |
| 2026-11-05 | #9654 (Erica Doornek's 5th game) | Betty Hume · Erica Doornek · Cameron Bays | $21,000 · $16,000 · $10,700 |
| 2026-10-23 | #9645 (Anthony Cantor's 5th game) | Shannon Leigh Godwin · Anthony Cantor · Ajin Tae | $16,001 · $8,000 · $200 |
| 2026-04-27 | #9551 | Greg Shahade · Jamie Ding · Katrina Puckett | $33,000 · $19,010 · $4,990 |
| 2026-03-17 | #9522 | Jamie Ding · Aidan O'Connell · Carman Nareau | $51,234 · $4,300 · $1 |
| 2026-01-30 | #9490 (Tournament of Champions exhibition) | Paolo Pasco · Laura Faddah · Scott Riccardi | $30,118 · $10,401 · $5,200 |

> On iPhone: open the link in Safari → Share → **Add to Home Screen** for a full-screen app with the gold "J" icon.

## How to play
- Clues are picked automatically, semi-randomly: high-value clues and staying in the current category are favoured, but there are no tidy top-to-bottom runs.
- Read the clue (the category banner is at the top); when the **border lights come on**, press **Space** or tap **BUZZ** (about 7 seconds). Buzzing too early locks you out for ¼ s, like the real show.
- After buzzing, type your response (15 s). Answer checking is lenient (“what is”, articles, punctuation, small typos, optional parenthetical parts). If it still gets you wrong, there's an **I was right** override.
- The ⏩ button (bottom left) skips the pause before the next clue. The ⏭ button (bottom right, under the sound toggle) jumps to Double Jeopardy, then to Final Jeopardy; skipped clues don't change your score, and the real contestants' scores at that point are shown for comparison.
- Not sure? Tap **Don't know · skip** (or press **S**/**Esc**) before or during the buzz window: no score change, the response is revealed and play moves on.
- Daily Doubles: wager up to your score or the round's top clue value. Final Jeopardy: wager, then 30 s to type.
- The end screen ranks you against the real contestants, with per-round scores.

## Run locally
Just open `index.html` in a browser — one self-contained file (fonts and episode data embedded), no server needed.

Debug URL params: `?fast=1` (short delays) and `?auto=1` (auto-plays the whole show, handy for testing).

## Files
- `index.html` – the built app (generated)
- `src/` – template, CSS, JS, episode data (`game-9551.json`); `build.py` assembles `index.html`
- `tools/` – icon generator and Playwright tests (`test.py`, `test_flows.py`, `test_judge.py`)
- `manifest.json`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `favicon.*` – home-screen app icon

## Limitations
- Clue pictures: J! Archive's original clue images aren't available, so picture clues show a related, openly licensed image from Wikimedia Commons (see `media/CREDITS.md`); they stand in for what was on TV, and clues that were audio/video on the show (e.g. one video clue) show text only.
- **No real buzz times:** no public dataset of per-clue buzz timing exists, so you don't race the real contestants' reflexes. You get the real clues/answers and who got each right or wrong on the show.
- Daily Double values/wagers are the real ones for the note shown after each clue; your own wager follows the real rules.

## Credits & rights
Clue data comes from the fan-run [J! Archive](https://j-archive.com/) (six episodes, one page each). *Jeopardy!* and all its elements belong to Jeopardy Productions, Inc.; this is an unofficial fan project for personal use. J! Archive's terms prohibit scraping and republication, and the clues are copyrighted — please don't redistribute or monetize this beyond personal use.
