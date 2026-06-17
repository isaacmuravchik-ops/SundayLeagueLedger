import React, { useMemo, useState } from "react";

/* ------------------------------------------------------------------ *
 * Sunday League — Match Ledger  (PROTOTYPE)
 * Data: 10 most recent games parsed from Vadim's recap emails
 * (May 10 – Jun 14, 2026). Nicknames are Vadim's; typos folded
 * (Matthiew→Matthew, Musa/Mussa→Mussa, Shenthon/Shenthen→Shenthen).
 * ------------------------------------------------------------------ */

const C = {
  canvas: "#13261c",
  canvas2: "#1b3527",
  cream: "#f2eee1",
  cream2: "#e7e1cf",
  ink: "#17241c",
  chalk: "#eef3e8",
  muted: "#9bb0a1",
  line: "rgba(238,243,232,0.14)",
  orange: "#e2552f",
  gold: "#d8a93c",
  win: "#3f7d57",
  loss: "#b6573e",
};

// team index 0 = first roster line, 1 = second line. vadim = index Vadim played on.
const GAMES = [
  {
    id: "2026-06-14", date: "Jun 14", wd: "Sun", venue: "Brielle", vadim: 1, score: [3, 4],
    labels: ["Team 1", "Team 2"],
    rosters: [
      ["Sandrik","Oleg","Gena","Denis","Muchnik","Mohammed","Jake","Edik","Semyon","Rustem","Yasha"],
      ["Vadim","Lesha","Mercky","Zhenya Def","Maxim","Dmitro","Bogdan","Joe","Dima SI","Sasha Ru","Vito"],
    ],
    gk: [null, null],
    goals: [
      {t:1,s:"Bogdan"},{t:1,s:"Bogdan",a:"Dima SI"},{t:0,s:"Edik",a:"Muchnik"},
      {t:0,s:"Jake"},{t:1,s:"Bogdan"},{t:1,s:"Lesha"},{t:0,s:"Jake"},
    ],
  },
  {
    id: "2026-06-13", date: "Jun 13", wd: "Sat", venue: "Kaiser", vadim: 0, score: [5, 2],
    labels: ["Team 1", "Team 2"],
    rosters: [
      ["Vadim","Nick Brazil","Matt","Matthew","Isaac","Zhenya Def","Kimran","Edik","Jake","Gary"],
      ["Alik","Max","Oleg","Emre","Kirill","Kolya","Sasha SI","Boroda","Elan","Yasha"],
    ],
    gk: [null, "Alik"],
    goals: [
      {t:0,s:"Gary"},{t:1,s:"Kirill",a:"Oleg"},{t:0,s:"Matthew"},{t:0,s:"Matthew"},
      {t:0,s:"Matthew"},{t:0,s:"Gary"},{t:1,s:"Max"},
    ],
  },
  {
    id: "2026-06-07", date: "Jun 7", wd: "Sun", venue: "Brielle", vadim: 1, score: [4, 2],
    labels: ["Team 1", "Team 2"],
    rosters: [
      ["Sasha Ru","Russell","Oleg","Emre","Isaac","Joe","Jake","Dima SI","Semyon","Lyonchik","Yasha"],
      ["Vadim","Matt","Mussa","Mercky","Maxim","Kimran","Dmitro","Sasha SI","Igor","Rustem","Vito"],
    ],
    gk: ["Semyon", "Igor"],
    goals: [
      {t:1,s:"Maxim",og:true},{t:0,s:"Yasha",a:"Russell"},{t:1,s:"Mercky"},
      {t:0,s:"Emre"},{t:0,s:"Russell"},{t:0,s:"Joe"},
    ],
  },
  {
    id: "2026-06-06", date: "Jun 6", wd: "Sat", venue: "Kaiser", vadim: 0, score: [3, 7],
    labels: ["Team 1", "Team 2"],
    rosters: [
      ["Vadim","Russell","Matt","Matthew","Boris","Boroda","Jake","Gary"],
      ["Alik","Max","Oleg","Kirill","Emre","Isaac","Kimran","Yasha"],
    ],
    gk: [null, "Kimran"],
    goals: [
      {t:0,s:"Gary"},{t:0,s:"Matthew"},{t:1,s:"Emre"},{t:1,s:"Emre"},{t:1,s:"Alik"},
      {t:1,s:"Kirill"},{t:1,s:"Kirill"},{t:0,s:"Russell"},{t:1,s:"Isaac"},{t:1,s:"Isaac"},
    ],
  },
  {
    id: "2026-05-31", date: "May 31", wd: "Sun", venue: "Brielle", vadim: 0, score: [0, 5],
    labels: ["Team 1", "Team 2"],
    rosters: [
      ["Vadim","Russell","Emre","Oleg","Kimran","Boris","Mohammed","Muchnik","Edik","Semyon","Lyonchik"],
      ["Maxim","Matt","Alan","Max","Isaac","Joe","Stas","Vova Br","Igor","Rustem","Yasha"],
    ],
    gk: ["Semyon", "Igor"],
    goals: [
      {t:1,s:"Maxim",og:true},{t:1,s:"Joe"},{t:1,s:"Isaac",a:"Matt"},{t:1,s:"Alan"},{t:1,s:"Stas"},
    ],
  },
  {
    id: "2026-05-30", date: "May 30", wd: "Sat", venue: "Kaiser", vadim: 0, score: [1, 0],
    labels: ["Team 1", "Team 2"],
    rosters: [
      ["Vadim","Max","Emre","Kimran","Boris","Isaac","Boroda","Mohammed","Vova","Gary"],
      ["Alik","Oleg","Kirill","Matthew","Misha L","Sasha SI","Edik","Nicholas","Stas","Yasha"],
    ],
    gk: ["Vadim", "Alik"],
    goals: [{t:0,s:"Isaac"}],
  },
  {
    id: "2026-05-24", date: "May 24", wd: "Sun", venue: "Brielle", vadim: 0, score: [3, 2],
    labels: ["Team 1", "Team 2"],
    rosters: [
      ["Vadim","Russell","Emre","Kimran","Joey","Mohammed","Varenik","Sasha Ru","Igor Tall","Dima SI","Vito"],
      ["Sandrik","Max","Mussa","Denis","Vitalik","Boris","Muchnik","Semyon","Edik","Slava","Rustem"],
    ],
    gk: ["Vadim", null],
    goals: [
      {t:0,s:"Kimran"},{t:0,s:"Emre"},{t:0,s:"Russell"},{t:1,s:"Muchnik"},{t:1,s:"Muchnik",a:"Max"},
    ],
  },
  {
    id: "2026-05-23", date: "May 23", wd: "Sat", venue: "Kaiser", vadim: 0, score: [5, 2],
    labels: ["RED", "Blue"],
    rosters: [
      ["Russell","Constantin","Kimran","Nicholas","Vadim","Zhenya Def","Emre","Boroda","Gary","Edik"],
      ["Matt","Kirill","Matthew","Jake","Slava","Boris","Oleg","Misha L","Sasha Ru","Sasha SI"],
    ],
    gk: ["Vadim", "Slava"],
    goals: [
      {t:0,s:"Russell"},{t:0,s:"Kimran"},{t:0,s:"Emre"},{t:0,s:"Nicholas",a:"Edik"},
      {t:1,s:"Kirill"},{t:1,s:"Jake"},{t:0,s:"Gary",a:"Nicholas"},
    ],
  },
  {
    id: "2026-05-17", date: "May 17", wd: "Sun", venue: "Brielle", vadim: 1, score: [3, 7],
    labels: ["Team 1", "Team 2"],
    rosters: [
      ["Sasha Ru","Russell","Mercky","Justin","Muchnik","Vitalik","Edik","Igor","Lyonchik","Yasha"],
      ["Vadim","Emre","Leo","Maxim","Joey","Boris","Kimran","Mohammed","Lesha","Rustem"],
    ],
    gk: ["Lyonchik", "Lesha"],
    goals: [
      {t:0,s:"Russell"},{t:0,s:"Justin"},{t:0,s:"Muchnik"},
      {t:1,s:"Leo"},{t:1,s:"Leo"},{t:1,s:"Leo"},{t:1,s:"Maxim"},{t:1,s:"Maxim"},{t:1,s:"Emre"},{t:1,s:"Kimran"},
    ],
  },
  {
    id: "2026-05-10", date: "May 10", wd: "Sun", venue: "Brielle", vadim: 1, score: [1, 2],
    labels: ["Team 1", "Team 2"],
    rosters: [
      ["Sandrik","Russell","Oleg","Gena","Leo","Mercky","Joey","Muchnik","Edik","Igor","Semyon","Yasha"],
      ["Vadim","Matt","Max","Sal","Shenthen","Denis","Boris","Dmitro","Mohammed","Sasha Ru","Lyonchik","Vito"],
    ],
    gk: ["Semyon", "Lyonchik"],
    goals: [
      {t:0,s:"Muchnik",a:"Leo"},{t:1,s:"Denis"},{t:1,s:"Denis",a:"Sal"},
    ],
  },
];

/* ----------------------------- stats ----------------------------- */
function buildStats() {
  const P = {};
  const get = (n) => (P[n] = P[n] || { name: n, gp: 0, g: 0, a: 0, w: 0, l: 0, d: 0, perGame: {} });
  for (const gm of GAMES) {
    const winner = gm.score[0] === gm.score[1] ? -1 : gm.score[0] > gm.score[1] ? 0 : 1;
    gm.rosters.forEach((roster, ti) => {
      roster.forEach((n) => {
        const p = get(n); p.gp++;
        if (winner === -1) p.d++; else if (winner === ti) p.w++; else p.l++;
        p.perGame[gm.id] = p.perGame[gm.id] || 0;
      });
    });
    for (const go of gm.goals) {
      if (go.s) { const p = get(go.s); p.g++; p.perGame[gm.id] = (p.perGame[gm.id] || 0) + 1; }
      if (go.a) { const p = get(go.a); p.a++; }
    }
  }
  return P;
}

const TOTALS = (() => {
  let goals = 0; GAMES.forEach((g) => (goals += g.score[0] + g.score[1]));
  const players = new Set(); GAMES.forEach((g) => g.rosters.flat().forEach((n) => players.add(n)));
  return { games: GAMES.length, goals, players: players.size };
})();

/* --------------------------- small UI ---------------------------- */
function Tally({ n, color }) {
  // grouped-by-5 dots, scoresheet style
  const groups = [];
  for (let i = 0; i < n; i += 5) groups.push(Math.min(5, n - i));
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {groups.map((cnt, gi) => (
        <span key={gi} style={{ display: "inline-flex", gap: 3 }}>
          {Array.from({ length: cnt }).map((_, i) => (
            <span key={i} style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
          ))}
        </span>
      ))}
    </span>
  );
}

function Pill({ children, bg, fg }) {
  return (
    <span className="font-mono" style={{ fontSize: 11, letterSpacing: 0.4, padding: "2px 7px", borderRadius: 999, background: bg, color: fg }}>
      {children}
    </span>
  );
}

/* ----------------------------- app ------------------------------- */
export default function App() {
  const [view, setView] = useState("table");
  const [player, setPlayer] = useState(null);
  const [match, setMatch] = useState(null);

  const stats = useMemo(buildStats, []);
  const ranked = useMemo(
    () => Object.values(stats).sort((a, b) => b.g - a.g || b.a - a.a || a.name.localeCompare(b.name)),
    [stats]
  );
  const maxG = ranked[0]?.g || 1;

  const Tab = ({ id, label }) => (
    <button
      onClick={() => { setView(id); setPlayer(null); setMatch(null); }}
      className="font-mono uppercase"
      style={{
        fontSize: 12, letterSpacing: 1, padding: "7px 14px", borderRadius: 999, cursor: "pointer",
        border: `1px solid ${view === id ? C.orange : C.line}`,
        background: view === id ? C.orange : "transparent",
        color: view === id ? "#fff" : C.chalk,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.canvas, color: C.chalk, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "28px 20px 64px" }}>
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="font-mono uppercase" style={{ fontSize: 11, letterSpacing: 3, color: C.orange }}>
              Brooklyn · Sat &amp; Sun mornings
            </div>
            <h1 style={{ margin: "4px 0 0", fontSize: 40, fontWeight: 900, lineHeight: 1, letterSpacing: -1 }}>
              Sunday League <span style={{ color: C.gold }}>Ledger</span>
            </h1>
          </div>
          <div className="font-mono" style={{ textAlign: "right", color: C.muted, fontSize: 12, lineHeight: 1.7 }}>
            <div>{TOTALS.games} games · {TOTALS.goals} goals · {TOTALS.players} players</div>
            <div>May 10 – Jun 14, 2026</div>
          </div>
        </div>

        <div style={{ height: 1, background: C.line, margin: "18px 0 20px" }} />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
          <Tab id="table" label="Standings" />
          <Tab id="board" label="Golden Boot" />
          <Tab id="players" label="Players" />
          <Tab id="matches" label="Matches" />
          <Tab id="ask" label="Ask" />
        </div>

        {view === "board" && <Board ranked={ranked} maxG={maxG} onPick={(n) => { setPlayer(n); setView("players"); }} />}
        {view === "table" && <Table ranked={ranked} onPick={(n) => { setPlayer(n); setView("players"); }} />}
        {view === "players" && (player
          ? <PlayerDetail p={stats[player]} onBack={() => setPlayer(null)} onMatch={(id) => { setMatch(id); setView("matches"); }} />
          : <PlayerGrid ranked={ranked} onPick={setPlayer} />)}
        {view === "matches" && (match
          ? <MatchDetail gm={GAMES.find((g) => g.id === match)} onBack={() => setMatch(null)} onPick={(n) => { setPlayer(n); setView("players"); }} />
          : <MatchList onPick={setMatch} />)}
        {view === "ask" && <Ask stats={stats} />}

        <div className="font-mono" style={{ marginTop: 40, color: C.muted, fontSize: 11, lineHeight: 1.7 }}>
          Prototype · 10-game sample · parsed live from Vadim's recap emails. Full history (≈422 games) and weekly
          refresh come with the GitHub build.
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Golden Boot -------------------------- */
function Board({ ranked, maxG, onPick }) {
  const top = ranked.filter((p) => p.g > 0).slice(0, 12);
  return (
    <div>
      <SectionTitle k="01" t="Golden Boot" s="goals scored · tap a name for the full card" />
      <div style={{ display: "grid", gap: 8 }}>
        {top.map((p, i) => {
          const leader = i === 0;
          return (
            <button key={p.name} onClick={() => onPick(p.name)}
              style={{
                display: "grid", gridTemplateColumns: "30px 1fr auto", alignItems: "center", gap: 14,
                textAlign: "left", cursor: "pointer", border: "none", borderRadius: 10,
                padding: "12px 16px", background: leader ? C.cream : C.canvas2,
                color: leader ? C.ink : C.chalk,
                outline: leader ? `2px solid ${C.gold}` : "none",
              }}>
              <span className="font-mono" style={{ fontSize: 18, fontWeight: 800, color: leader ? C.gold : C.muted }}>
                {i + 1}
              </span>
              <span>
                <span style={{ fontSize: 17, fontWeight: 800 }}>{p.name}</span>
                <span className="font-mono" style={{ display: "block", marginTop: 6 }}>
                  <Tally n={p.g} color={leader ? C.orange : C.gold} />
                </span>
              </span>
              <span className="font-mono" style={{ textAlign: "right" }}>
                <span style={{ fontSize: 26, fontWeight: 900, color: leader ? C.orange : C.chalk }}>{p.g}</span>
                <span style={{ display: "block", fontSize: 10, letterSpacing: 1, color: leader ? C.muted : C.muted }}>
                  {p.gp} games
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------- Standings --------------------------- */
function Table({ ranked, onPick }) {
  const [sort, setSort] = useState("pm");
  const withPm = ranked.map((p) => ({ ...p, pm: p.w - p.l }));
  const key = (p) => (sort === "pm" ? p.pm : p[sort]);
  const rows = [...withPm].sort((a, b) => key(b) - key(a) || b.pm - a.pm || b.g - a.g);
  const H = ({ k, label, w }) => (
    <button onClick={() => setSort(k)} className="font-mono uppercase"
      style={{ background: "none", border: "none", cursor: "pointer", textAlign: "right", width: w,
        color: sort === k ? C.orange : C.muted, fontSize: 11, letterSpacing: 1 }}>
      {label}
    </button>
  );
  const GRID = "1fr 40px 84px 58px 44px";
  return (
    <div>
      <SectionTitle k="01" t="Standings" s="2026 season · ranked by +/− (wins − losses)" />
      <div style={{ background: C.canvas2, borderRadius: 10, overflow: "hidden" }}>
        <div className="font-mono" style={{ display: "grid", gridTemplateColumns: GRID, gap: 8,
          padding: "10px 16px", borderBottom: `1px solid ${C.line}`, color: C.muted, fontSize: 11, alignItems: "center" }}>
          <span style={{ letterSpacing: 1 }}>PLAYER</span>
          <H k="gp" label="GP" w="100%" />
          <span style={{ letterSpacing: 1, textAlign: "center" }}>W-L-D</span>
          <H k="pm" label="+/−" w="100%" />
          <H k="g" label="G" w="100%" />
        </div>
        {rows.map((p, i) => (
          <button key={p.name} onClick={() => onPick(p.name)}
            style={{ width: "100%", display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center",
              textAlign: "left", padding: "9px 16px", cursor: "pointer", border: "none",
              background: i % 2 ? "rgba(255,255,255,0.02)" : "transparent", color: C.chalk }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              <span className="font-mono" style={{ color: C.muted, marginRight: 8, fontSize: 12 }}>{i + 1}</span>{p.name}
            </span>
            <span className="font-mono" style={{ color: C.muted, textAlign: "right" }}>{p.gp}</span>
            <span className="font-mono" style={{ fontSize: 12, textAlign: "center" }}>
              <span style={{ color: C.win }}>{p.w}</span>-<span style={{ color: C.loss }}>{p.l}</span>-{p.d}
            </span>
            <span className="font-mono" style={{ textAlign: "right", fontWeight: 800,
              color: p.pm > 0 ? C.win : p.pm < 0 ? C.loss : C.muted }}>
              {p.pm > 0 ? "+" : ""}{p.pm}
            </span>
            <span className="font-mono" style={{ textAlign: "right", color: C.orange, fontWeight: 700 }}>{p.g}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- Players ---------------------------- */
function PlayerGrid({ ranked, onPick }) {
  const [q, setQ] = useState("");
  const list = ranked.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div>
      <SectionTitle k="03" t="Players" s={`${ranked.length} on the books`} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name…"
        className="font-mono"
        style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", marginBottom: 14, borderRadius: 8,
          background: C.canvas2, border: `1px solid ${C.line}`, color: C.chalk, fontSize: 13, outline: "none" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
        {list.map((p) => (
          <button key={p.name} onClick={() => onPick(p.name)}
            style={{ textAlign: "left", cursor: "pointer", border: `1px solid ${C.line}`, borderRadius: 9,
              padding: "11px 13px", background: C.canvas2, color: C.chalk }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{p.name}</div>
            <div className="font-mono" style={{ marginTop: 5, fontSize: 11, color: C.muted }}>
              <span style={{ color: C.orange }}>{p.g}g</span> · {p.a}a · {p.gp}gp
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayerDetail({ p, onBack, onMatch }) {
  const log = GAMES.filter((g) => g.rosters.flat().includes(p.name))
    .map((g) => {
      const ti = g.rosters[0].includes(p.name) ? 0 : 1;
      const won = g.score[ti] > g.score[1 - ti];
      const draw = g.score[0] === g.score[1];
      return { g, ti, won, draw, goals: p.perGame[g.id] || 0 };
    });
  const wp = p.gp ? Math.round((p.w / p.gp) * 100) : 0;
  const Stat = ({ v, l, c }) => (
    <div style={{ background: C.canvas2, borderRadius: 9, padding: "12px 14px", flex: 1, minWidth: 70 }}>
      <div className="font-mono" style={{ fontSize: 26, fontWeight: 900, color: c || C.chalk }}>{v}</div>
      <div className="font-mono uppercase" style={{ fontSize: 10, letterSpacing: 1, color: C.muted, marginTop: 2 }}>{l}</div>
    </div>
  );
  return (
    <div>
      <BackBtn onBack={onBack} label="all players" />
      <h2 style={{ fontSize: 32, fontWeight: 900, margin: "6px 0 14px", letterSpacing: -0.5 }}>{p.name}</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
        <Stat v={p.g} l="Goals" c={C.orange} />
        <Stat v={`${p.w - p.l > 0 ? "+" : ""}${p.w - p.l}`} l="+/−" c={p.w - p.l > 0 ? C.win : p.w - p.l < 0 ? C.loss : C.muted} />
        <Stat v={p.gp} l="Games" />
        <Stat v={`${p.w}-${p.l}-${p.d}`} l="W-L-D" />
        <Stat v={`${wp}%`} l="Win rate" c={wp >= 50 ? C.win : C.loss} />
      </div>
      <SectionTitle k="" t="Game log" s="" />
      <div style={{ display: "grid", gap: 6 }}>
        {log.map(({ g, won, draw, goals }) => (
          <button key={g.id} onClick={() => onMatch(g.id)}
            style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 12, alignItems: "center",
              textAlign: "left", cursor: "pointer", border: "none", borderRadius: 8, padding: "10px 14px",
              background: C.canvas2, color: C.chalk }}>
            <span className="font-mono" style={{ fontSize: 12, color: C.muted, width: 58 }}>{g.wd} {g.date}</span>
            <span className="font-mono" style={{ fontSize: 12, color: C.muted }}>{g.venue}</span>
            <span style={{ display: "flex", gap: 4 }}>
              {goals > 0 && <Pill bg={C.orange} fg="#fff">{goals}⚽</Pill>}
            </span>
            <Pill bg={draw ? "#5b6b60" : won ? C.win : C.loss} fg="#fff">{draw ? "D" : won ? "W" : "L"}</Pill>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- Matches ---------------------------- */
function MatchList({ onPick }) {
  return (
    <div>
      <SectionTitle k="04" t="Matches" s="tap for rosters & goals" />
      <div style={{ display: "grid", gap: 8 }}>
        {GAMES.map((g) => {
          const w0 = g.score[0] > g.score[1], w1 = g.score[1] > g.score[0];
          return (
            <button key={g.id} onClick={() => onPick(g.id)}
              style={{ display: "grid", gridTemplateColumns: "92px 1fr auto", gap: 12, alignItems: "center",
                textAlign: "left", cursor: "pointer", border: "none", borderRadius: 10, padding: "13px 16px",
                background: C.canvas2, color: C.chalk }}>
              <span className="font-mono" style={{ fontSize: 12, color: C.muted }}>
                {g.wd} {g.date}<br /><span style={{ color: C.orange }}>{g.venue}</span>
              </span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>
                <span style={{ opacity: w1 ? 0.5 : 1 }}>{g.labels[0]}</span>
                <span style={{ color: C.muted }}> v </span>
                <span style={{ opacity: w0 ? 0.5 : 1 }}>{g.labels[1]}</span>
              </span>
              <span className="font-mono" style={{ fontSize: 22, fontWeight: 900 }}>
                <span style={{ color: w0 ? C.orange : C.muted }}>{g.score[0]}</span>
                <span style={{ color: C.muted }}>:</span>
                <span style={{ color: w1 ? C.orange : C.muted }}>{g.score[1]}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MatchDetail({ gm, onBack, onPick }) {
  const w = gm.score[0] === gm.score[1] ? -1 : gm.score[0] > gm.score[1] ? 0 : 1;
  const scorers = (ti) => gm.goals.filter((x) => x.t === ti);
  const Col = ({ ti }) => (
    <div style={{ background: ti === w ? C.cream : C.canvas2, color: ti === w ? C.ink : C.chalk,
      borderRadius: 10, padding: "14px 16px", outline: ti === w ? `2px solid ${C.gold}` : "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="font-mono uppercase" style={{ fontSize: 12, letterSpacing: 1, fontWeight: 700 }}>{gm.labels[ti]}</span>
        <span className="font-mono" style={{ fontSize: 26, fontWeight: 900, color: ti === w ? C.orange : C.muted }}>{gm.score[ti]}</span>
      </div>
      <div style={{ height: 1, background: ti === w ? "rgba(0,0,0,0.1)" : C.line, margin: "10px 0" }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {gm.rosters[ti].map((n) => (
          <button key={n} onClick={() => onPick(n)} className="font-mono"
            style={{ cursor: "pointer", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 12,
              background: ti === w ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)", color: ti === w ? C.ink : C.chalk }}>
            {n}{gm.gk[ti] === n ? " 🧤" : ""}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        {scorers(ti).map((x, i) => (
          <div key={i} className="font-mono" style={{ fontSize: 12, marginTop: 4, color: ti === w ? C.ink : C.chalk }}>
            <span style={{ color: C.orange }}>⚽</span> {x.s || x.note}
            {x.og ? <span style={{ color: C.loss }}> (og)</span> : null}
            {x.a ? <span style={{ color: C.muted }}> — assist {x.a}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div>
      <BackBtn onBack={onBack} label="all matches" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "6px 0 16px" }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5 }}>{gm.wd}, {gm.date}</h2>
        <span className="font-mono" style={{ color: C.orange, fontSize: 13 }}>{gm.venue}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Col ti={0} /><Col ti={1} />
      </div>
      <div className="font-mono" style={{ marginTop: 12, color: C.muted, fontSize: 11 }}>🧤 = in goal · winning side outlined in gold</div>
    </div>
  );
}

/* ------------------------------- Ask ------------------------------ */
function Ask({ stats }) {
  const [msgs, setMsgs] = useState([
    { role: "assistant", text: "Ask me anything about the season so far — top scorers, a player's record, head-to-heads, who plays with whom. e.g. \"Who has the best win rate?\" or \"How many goals does Isaac have?\"" },
  ]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const dataset = useMemo(() => ({
    games: GAMES.map((g) => ({ date: g.id, venue: g.venue, score: g.score, labels: g.labels,
      teams: g.rosters, goals: g.goals })),
    players: Object.values(stats).map((p) => ({ name: p.name, gp: p.gp, goals: p.g, assists: p.a, w: p.w, l: p.l, d: p.d })),
  }), [stats]);

  async function send() {
    const question = q.trim();
    if (!question || busy) return;
    const next = [...msgs, { role: "user", text: question }];
    setMsgs(next); setQ(""); setBusy(true);
    const apiMsgs = (next[0] && next[0].role === "assistant" ? next.slice(1) : next)
      .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }));
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system:
            "You are the stats assistant for a Brooklyn pickup soccer league. Answer ONLY from the JSON dataset provided. " +
            "Nicknames are the player identities. Goals with scorer null are team goals with no individual credit. " +
            "A player's team won a game if their team's score is higher. Be concise, use numbers, and if asked something " +
            "the data can't answer, say so. Dataset:\n" + JSON.stringify(dataset),
          messages: apiMsgs,
        }),
      });
      const data = await res.json();
      const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
      setMsgs((m) => [...m, { role: "assistant", text: text || "No answer returned." }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: "Couldn't reach the model just now. Try again in a moment." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SectionTitle k="05" t="Ask the Ledger" s="natural-language questions over the data — live" />
      <div style={{ background: C.canvas2, borderRadius: 12, padding: 14, minHeight: 240 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
            <div style={{ maxWidth: "85%", padding: "10px 13px", borderRadius: 12, fontSize: 14, lineHeight: 1.5,
              whiteSpace: "pre-wrap", background: m.role === "user" ? C.orange : C.canvas, color: m.role === "user" ? "#fff" : C.chalk,
              border: m.role === "user" ? "none" : `1px solid ${C.line}` }}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="font-mono" style={{ color: C.muted, fontSize: 12, padding: "2px 4px" }}>thinking…</div>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Who has the most assists?" className="font-mono"
          style={{ flex: 1, padding: "12px 14px", borderRadius: 9, background: C.canvas2, border: `1px solid ${C.line}`,
            color: C.chalk, fontSize: 13, outline: "none" }} />
        <button onClick={send} disabled={busy}
          style={{ padding: "0 20px", borderRadius: 9, border: "none", cursor: busy ? "default" : "pointer",
            background: C.orange, color: "#fff", fontWeight: 800, opacity: busy ? 0.6 : 1 }}>
          Ask
        </button>
      </div>
    </div>
  );
}

/* ----------------------------- chrome ----------------------------- */
function SectionTitle({ k, t, s }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        {k && <span className="font-mono" style={{ color: C.orange, fontSize: 13, fontWeight: 700 }}>{k}</span>}
        <h2 style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.3 }}>{t}</h2>
      </div>
      {s && <div className="font-mono" style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>{s}</div>}
    </div>
  );
}
function BackBtn({ onBack, label }) {
  return (
    <button onClick={onBack} className="font-mono uppercase"
      style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 11, letterSpacing: 1, padding: 0 }}>
      ← {label}
    </button>
  );
}
