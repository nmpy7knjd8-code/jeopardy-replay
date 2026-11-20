# 🎬 Jeopardy! Replay

## ▶️ **Play it: https://nmpy7knjd8-code.github.io/jeopardy-replay/**

A simple personal web app that lets you play through a **real *Jeopardy!* episode** — Jeopardy round, Double Jeopardy, Daily Doubles and Final Jeopardy — and then compares your score with the real contestants.

Example episode: **Show #9551, aired Monday, April 27, 2026** (Jamie Ding's 32nd game — Greg Shahade ends the streak).
Real final scores: Greg Shahade $33,000 · Jamie Ding $19,010 · Katrina Puckett $4,990.

> On iPhone: open the link in Safari → Share → **Add to Home Screen** for a full-screen app with the gold "J" icon.

## How to play
- Clues are picked automatically, semi-randomly: high-value clues and staying in the current category are favoured, but there are no tidy top-to-bottom runs.
- Read the clue; when the **border lights come on**, press **Space** or tap **BUZZ** (about 5 seconds). Buzzing too early locks you out for ¼ s, like the real show.
- After buzzing, type your response (15 s). Answer checking is lenient (“what is”, articles, punctuation, small typos, optional parenthetical parts). If it still gets you wrong, there's an **I was right** override.
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
- **No real buzz times:** no public dataset of per-clue buzz timing exists, so you don't race the real contestants' reflexes. You get the real clues/answers and who got each right or wrong on the show.
- Clues that were accompanied by a picture on TV are shown as text only (marked with a 📺 note); no audio/video clues were used in this episode.
- Daily Double values/wagers are the real ones for the note shown after each clue; your own wager follows the real rules.

## Credits & rights
Clue data comes from the fan-run [J! Archive](https://j-archive.com/) (one episode, fetched once). *Jeopardy!* and all its elements belong to Jeopardy Productions, Inc.; this is an unofficial fan project for personal use. J! Archive's terms prohibit scraping and republication, and the clues are copyrighted — please don't redistribute or monetize this beyond personal use.
