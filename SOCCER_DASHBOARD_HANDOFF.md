# Sunday League Stats — Build Plan (Claude Code Handoff)

**Supersedes the earlier Supabase plan.** This is the spec for a single-user web
dashboard over a Brooklyn pickup-soccer league, built from the recap emails one
organizer (Vadim) sends after every game. It has been validated against 10 real
games and the league's own stats workbook.

---

## 0. Decisions already made (do not re-litigate)

- **Housing:** no hosted database. The dataset is tiny (~1 year ≈ 200 games, ~70
  players, a few thousand goals). Ship it as **one static data file** queried
  client-side with **DuckDB-WASM**. No Supabase, no server DB, no auth.
- **Surface:** a **web dashboard** (Vite + React + Tailwind, deploy on Vercel — same
  stack as the owner's other projects). Single user.
- **Identity:** **nicknames only.** No emails, no real names. The only name-folding
  that ever happens is fixing a typo variant of one person.
- **AI layer:** a chat box backed by **one Vercel serverless function** (holds the
  Anthropic API key). Because the data is small, no vector store — pass SQL results
  and/or raw recap text straight to Claude.

---

## 1. The source: Vadim's emails

All game data comes from `from:vadimpalmer@yahoo.com`. He emails a large (~150
person) distribution list; the cc list is **not** the per-game roster — only the
names in the body are. There are **four** message kinds; classify each:

| Kind | How to detect | What it gives |
|---|---|---|
| **Announcement** | Subject has venue + time, e.g. `Saturday, May 9, Kaiser, 7 am` (extra commas / `am`/`pm`) | Venue for that date; pre-game roster |
| **Recap** | Subject is bare `Weekday, Month DD` (≤1 comma, no time) | Rosters, goals, score — the core data |
| **Stats** | Subject contains `stats`; carries an `.xlsx` attachment (`soccer YYYY (n).xlsx`) | **Authoritative** canonical player list + official +/− standings |
| **Other** | Replies (`Re:`), scheduling, cancellations | Ignore |

### Recap body format (validated across 10 games)
```
N people
<team 1 roster, comma-separated>
<team 2 roster, comma-separated>
<narrative with score progression like "2:0", "1:1", ... and a stated final>
```
Observed variations the parser MUST handle:
- Team lines may be labeled (`Team RED:` / `Team Blue:`) instead of unlabeled.
- The narrator writes in first person ("we won 5:2"); **which roster line is "we"
  varies game to game** — infer it from who scores, never from position.
- Some recaps append an explicit tally: `Goals:\n<team1 scorers>\n<team2 scorers>`
  with counts like `Leo-3, Maxim -2`. **When present, this block is authoritative**
  over the prose.
- Own goals / deflections ("redirected into our net"), unnamed scorers resolvable
  from context ("Leo's father" = Muchnik), rotating keepers, games stopped early.

### Stats workbook = source of truth for identity
The name-distinctness rule: **if a name appears in Vadim's stats workbook, it is a
distinct person.** So `Matt` vs `Matthew`, `Joe` vs `Joey`, `Mussa` vs `Mohammed`,
`Vova` vs `Vova Br`, `Igor` vs `Igor Tall` are all separate players — never merge
two names that both appear in the workbook. Pull the workbook via the Gmail API
(`messages.attachments.get`) and parse with `openpyxl` to seed the canonical roster
and to reconcile computed standings.

---

## 2. Data model (the static file)

Output of the pipeline is a single JSON file (`/data/league.json`) the front end
loads into DuckDB-WASM. Shape:

```jsonc
{
  "players": [ { "id": "muchnik", "nickname": "Muchnik" } ],
  "aliases": [ { "alias": "Matthiew", "player_id": "matthew" } ],   // typo folds ONLY
  "games": [
    {
      "id": "2026-06-13", "date": "2026-06-13", "weekday": "Sat",
      "season": 2026, "venue": "Kaiser",
      "team_labels": ["Team 1", "Team 2"],
      "rosters": [ ["Vadim","Gary", ...], ["Alik","Max", ...] ],
      "gk": [null, "Alik"],
      "score": [5, 2],
      "goals": [
        { "team": 0, "scorer": "Gary", "assist": null, "og": false, "seq": 1 },
        { "team": 1, "scorer": "Kirill", "assist": "Oleg", "og": false, "seq": 2 }
      ],
      "highlights": "free text from the recap",
      "confidence": "high", "needs_review": false
    }
  ]
}
```

Rules baked into the model:
- **scorer** is a player nickname, or `null` for a team goal with no individual
  credit (only after trying to resolve from narrative).
- **assist** is a *bonus* field — populated only when Vadim names it. Never ranked
  or required.
- **og: true** still increments the *opposing* team's score.
- A roster lists everyone who played → that's a player's "appearance" for the game.

DuckDB-WASM load (in the browser): create `players`, `games`, `rosters`, `goals`
tables/views from the JSON, then run SQL for stats.

---

## 3. Standings spec (the official leaderboard)

The league leaderboard is **per calendar year, ranked by +/− = wins − losses.**

- For each game a player is rostered in: their team **wins** if its score is higher,
  **loses** if lower, **draws** if equal.
- `plus_minus = wins − losses`. Rank by `plus_minus` desc.
- Tie-breakers: `plus_minus`, then goals, then games played.
- A separate **Golden Boot** board ranks by goals.
- When a stats workbook exists for the year, reconcile the computed `plus_minus`
  table against it and flag any player whose numbers disagree (surfaces parse gaps).

Goals are the only ranked attacking stat. **Assists are not a defined stat** — show
them only on match pages as a bonus where mentioned.

---

## 4. Extraction pipeline (Python, run locally with owner's Gmail creds)

Modules:

1. **ingest** — Gmail API, `from:vadimpalmer@yahoo.com`, paginate full history on
   first run, then incremental (persist processed message-ids + last `historyId`).
   Store raw subject/body per message. Idempotent.
2. **classify** — subject/attachment heuristics from §1 → `announcement | recap |
   stats | other`. Confirm ambiguous ones with a cheap Claude call.
3. **extract** — for each **recap**, Claude → JSON per the §2 schema. Prompt rules:
   output JSON only; names verbatim; infer the "we" team from scoring; prefer the
   explicit `Goals:` block when present; mark own goals; compute score from goals and
   compare to the stated final — on mismatch set `confidence:"low"`,
   `needs_review:true`. For **stats** emails, download + parse the `.xlsx`.
4. **resolve names** — tiered: normalize (lowercase/trim/collapse spaces) →
   exact-match alias lookup → **guarded fuzzy** fallback (length-aware: ~1 edit ≤5
   chars, ~2 ≤10, beats runner-up by a clear margin) → else review queue. **Never
   fuzz-merge two names that both appear in the stats workbook.** Log every fuzzy
   correction.
5. **assemble** — merge announcement venue (matched by date) into the game; upgrade
   scheduled→played; write `/data/league.json`. Re-runnable; new weekend games just
   re-run (optionally a GitHub Action on a Sat/Sun cron).

---

## 5. Frontend (Vite + React + Tailwind, Vercel)

Port the approved prototype (`SundayLeagueLedger.jsx`) — "matchday programme"
look: deep pitch-green canvas, cream scoresheet cards, kit-orange + gold accents,
mono for figures. Views:

- **Standings** (default) — calendar-year, ranked by +/−; year selector; columns
  Player · GP · W-L-D · +/− · G.
- **Golden Boot** — goals, hand-tally board.
- **Players** — searchable; each → card with goals, +/−, GP, W-L-D, win%, game log.
- **Matches** — list → detail with both rosters (RED/Blue labels honored), goals,
  GK (🧤), and **assists shown as a bonus**, winner highlighted.
- **Ask** — chat (see §6).

Data access: load `/data/league.json` into DuckDB-WASM once; all views are SQL.

---

## 6. AI query layer

One Vercel serverless function holding `ANTHROPIC_API_KEY`. Flow:
1. User question → function asks Claude to write a read-only DuckDB SQL query
   against the documented schema.
2. Browser runs the SQL in DuckDB-WASM.
3. Results (and, for qualitative questions, the relevant recap `highlights` text)
   go back to Claude to summarize in plain language, citing dates.

Guardrails: SELECT-only, row cap, schema passed explicitly. Given the data size, a
fallback path may simply hand Claude the whole dataset for simple questions.

---

## 7. Edge cases to implement (all seen in real data)

- Holiday games (e.g. Memorial Day `Monday, May 25`) and any same-date doubleheader
  → disambiguate with a sequence suffix.
- Games stopped early; lopsided scores; injuries.
- Substitutes joining mid-roster (e.g. a 15-y-o named Justin replacing Sal).
- Rotating keepers within one game.
- Venue only in the announcement → join by date; some recaps have no venue.
- Own goals / deflections; unnamed scorers resolvable from prose.
- New players appearing → surface in review until added; workbook is the authority.

---

## 8. Build order (commit & push after each step)

0. Repo scaffold (suggest `sunday-league-ledger`): `/pipeline` (Python), `/web`
   (Vite app), `/data`. README.
1. Gmail ingest + raw store + incremental sync.
2. Classifier (4 kinds) + stats-workbook xlsx parser → seed canonical players.
3. Recap extractor (Claude) + name resolver + review queue.
4. Assembler → `/data/league.json`; backfill all history.
5. DuckDB-WASM load + Standings + Golden Boot + Players + Matches (port prototype).
6. Ask function (text-to-SQL + summarize).
7. Reconcile vs workbook; optional weekend GitHub Action to refresh.

---

## Appendix A — validated test fixtures

Use these parsed games (already confirmed correct) as parser regression tests.
Each line: date — final — notable scoring / edge case.

- 2026-06-14 — 3:4 — Bogdan hat trick; assist-heavy (Dima SI). "we" = line 2.
- 2026-06-13 — 5:2 — Matthew natural hat trick; "we" = line **1** (position varies).
- 2026-06-07 — 4:2 — own-goal-style deflection (Maxim off Semyon); first-person loss.
- 2026-06-06 — 7:3 — `Matthiew`→Matthew typo; Kimran in goal; Isaac 2g.
- 2026-05-31 — 5:0 — game stopped early; all goals one side.
- 2026-05-30 — 1:0 — single goal (Isaac); Vadim in goal; rotating keeper.
- 2026-05-24 — 3:2 — `Igor Tall` distinct from `Igor`; Muchnik brace.
- 2026-05-23 — 5:2 — `Team RED`/`Team Blue` labels; assists named (Edik, Nicholas).
- 2026-05-17 — 7:3 — explicit `Goals:` tally block; Leo hat trick.
- 2026-05-10 — 1:2 — unnamed scorer "Leo's father" = **Muchnik** (assist Leo).
