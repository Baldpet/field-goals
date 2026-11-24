// Builds public/data/field_goals.json from nflverse data.
// Usage: node scripts/build-data.mjs [season]
// No dependencies: uses Node's built-in fetch, zlib and fs.

import { gunzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = join(ROOT, "public", "data", "field_goals.json");

const SCHEDULE_URL =
  "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";
const pbpUrl = (season) =>
  `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;

// NFL seasons start in September; Jan–Jul belong to the previous season.
function defaultSeason(now = new Date()) {
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

// Minimal RFC 4180 CSV parser (handles quoted fields, escaped quotes, newlines in quotes).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }

  const [header, ...body] = rows;
  return body
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const num = (v) => (v === "" || v === "NA" || v == null ? null : Number(v));
const str = (v) => (v === "" || v === "NA" || v == null ? null : v);

async function fetchOk(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

async function loadSchedule(season) {
  const text = await (await fetchOk(SCHEDULE_URL)).text();
  return parseCsv(text).filter((g) => Number(g.season) === season);
}

async function loadFieldGoals(season) {
  let res;
  try {
    res = await fetchOk(pbpUrl(season));
  } catch (err) {
    // Before the season starts there is no play-by-play file yet.
    console.warn(`No play-by-play for ${season} yet (${err.message}).`);
    return [];
  }
  const text = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");
  return parseCsv(text)
    .filter((p) => p.play_type === "field_goal" && p.field_goal_result !== "NA")
    .map((p) => ({
      game_id: p.game_id,
      play_id: num(p.play_id),
      qtr: num(p.qtr),
      time: str(p.time),
      team: str(p.posteam),
      opponent: str(p.defteam),
      kicker: str(p.kicker_player_name),
      kicker_id: str(p.kicker_player_id),
      distance: num(p.kick_distance),
      result: str(p.field_goal_result), // made | missed | blocked
      score_diff: num(p.score_differential), // kicking team's margin before the kick
    }));
}

async function main() {
  const season = Number(process.argv[2]) || defaultSeason();
  console.log(`Building field goal data for the ${season} season…`);

  const [schedule, kicks] = await Promise.all([
    loadSchedule(season),
    loadFieldGoals(season),
  ]);

  const kicksByGame = new Map();
  for (const k of kicks) {
    if (!kicksByGame.has(k.game_id)) kicksByGame.set(k.game_id, []);
    kicksByGame.get(k.game_id).push(k);
  }

  const games = schedule.map((g) => ({
    game_id: g.game_id,
    game_type: g.game_type, // REG, WC, DIV, CON, SB
    week: num(g.week),
    gameday: g.gameday,
    gametime: str(g.gametime), // US Eastern
    away_team: g.away_team,
    home_team: g.home_team,
    away_score: num(g.away_score),
    home_score: num(g.home_score),
    stadium: str(g.stadium),
    roof: str(g.roof),
    surface: str(g.surface),
    temp: num(g.temp),
    wind: num(g.wind),
    field_goals: (kicksByGame.get(g.game_id) ?? [])
      .sort((a, b) => a.play_id - b.play_id)
      .map(({ game_id, play_id, ...rest }) => rest),
  }));

  const output = {
    season,
    generated_at: new Date().toISOString(),
    source: "nflverse (github.com/nflverse)",
    games,
  };

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(output));
  const played = games.filter((g) => g.home_score !== null).length;
  console.log(
    `Wrote ${games.length} games (${played} played) and ${kicks.length} field goal attempts to ${OUT_FILE}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
