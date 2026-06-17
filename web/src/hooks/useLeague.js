/**
 * Initializes DuckDB-WASM once, loads /data/league.json, and creates
 * relational tables. Exposes a query(sql) function for all views to use.
 *
 * Tables created:
 *   players(id TEXT, nickname TEXT)
 *   aliases(alias TEXT, player_id TEXT)
 *   games(id TEXT, date TEXT, weekday TEXT, season INT, venue TEXT,
 *         team_label_0 TEXT, team_label_1 TEXT,
 *         score_0 INT, score_1 INT,
 *         gk_0 TEXT, gk_1 TEXT,
 *         highlights TEXT, confidence TEXT, needs_review BOOL)
 *   rosters(game_id TEXT, team INT, nickname TEXT)
 *   goals(game_id TEXT, seq INT, team INT, scorer TEXT,
 *         assist TEXT, og BOOL)
 */

import { useEffect, useRef, useState } from "react";
import * as duckdb from "@duckdb/duckdb-wasm";

let _db = null;
let _conn = null;
let _initPromise = null;

async function initDuckDB() {
  if (_db) return { db: _db, conn: _conn };

  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" })
  );
  const worker = new Worker(worker_url);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  _db = new duckdb.AsyncDuckDB(logger, worker);
  await _db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  _conn = await _db.connect();
  return { db: _db, conn: _conn };
}

async function loadLeague(conn) {
  const res = await fetch("/data/league.json");
  const data = await res.json();

  await conn.query("DROP TABLE IF EXISTS goals");
  await conn.query("DROP TABLE IF EXISTS rosters");
  await conn.query("DROP TABLE IF EXISTS games");
  await conn.query("DROP TABLE IF EXISTS aliases");
  await conn.query("DROP TABLE IF EXISTS players");

  await conn.query(`
    CREATE TABLE players (id TEXT, nickname TEXT)
  `);
  await conn.query(`
    CREATE TABLE aliases (alias TEXT, player_id TEXT)
  `);
  await conn.query(`
    CREATE TABLE games (
      id TEXT, date TEXT, weekday TEXT, season INT, venue TEXT,
      team_label_0 TEXT, team_label_1 TEXT,
      score_0 INT, score_1 INT,
      gk_0 TEXT, gk_1 TEXT,
      highlights TEXT, confidence TEXT, needs_review BOOL
    )
  `);
  await conn.query(`
    CREATE TABLE rosters (game_id TEXT, team INT, nickname TEXT)
  `);
  await conn.query(`
    CREATE TABLE goals (
      game_id TEXT, seq INT, team INT, scorer TEXT, assist TEXT, og BOOL
    )
  `);

  const stmt_p = await conn.prepare("INSERT INTO players VALUES (?, ?)");
  for (const p of data.players) await stmt_p.query(p.id, p.nickname);
  await stmt_p.close();

  const stmt_a = await conn.prepare("INSERT INTO aliases VALUES (?, ?)");
  for (const a of data.aliases) await stmt_a.query(a.alias, a.player_id);
  await stmt_a.close();

  const stmt_g = await conn.prepare(
    "INSERT INTO games VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  );
  for (const g of data.games) {
    await stmt_g.query(
      g.id, g.date, g.weekday, g.season, g.venue ?? null,
      g.team_labels[0], g.team_labels[1],
      g.score[0], g.score[1],
      g.gk[0] ?? null, g.gk[1] ?? null,
      g.highlights ?? "", g.confidence, g.needs_review ?? false
    );
  }
  await stmt_g.close();

  const stmt_r = await conn.prepare("INSERT INTO rosters VALUES (?,?,?)");
  for (const g of data.games) {
    for (let ti = 0; ti < 2; ti++) {
      for (const nickname of g.rosters[ti]) {
        await stmt_r.query(g.id, ti, nickname);
      }
    }
  }
  await stmt_r.close();

  const stmt_go = await conn.prepare("INSERT INTO goals VALUES (?,?,?,?,?,?)");
  for (const g of data.games) {
    for (const goal of g.goals) {
      await stmt_go.query(
        g.id, goal.seq, goal.team,
        goal.scorer ?? null, goal.assist ?? null, goal.og ?? false
      );
    }
  }
  await stmt_go.close();
}

export function useLeague() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const connRef = useRef(null);

  useEffect(() => {
    if (_initPromise) {
      _initPromise.then(({ conn }) => {
        connRef.current = conn;
        setReady(true);
      }).catch(setError);
      return;
    }
    _initPromise = initDuckDB().then(async ({ conn }) => {
      connRef.current = conn;
      await loadLeague(conn);
      setReady(true);
      return { conn };
    }).catch((e) => {
      setError(e);
      throw e;
    });
  }, []);

  async function query(sql) {
    if (!connRef.current) throw new Error("DuckDB not ready");
    const result = await connRef.current.query(sql);
    return result.toArray().map((row) => Object.fromEntries(
      result.schema.fields.map((f) => [f.name, row[f.name]])
    ));
  }

  return { ready, error, query };
}
