const $ = (sel) => document.querySelector(sel);

const state = {
  data: null,
  view: "schedule",
  week: null,
  team: "",
  minAtt: 5,
  sort: { key: "made", dir: -1 },
};

const ROUND_NAMES = { WC: "Wild Card", DIV: "Divisional", CON: "Conference", SB: "Super Bowl" };

// Weeks list: regular-season week numbers, then playoff rounds.
function weekKey(g) {
  return g.game_type === "REG" ? `W${g.week}` : g.game_type;
}
function weekLabel(key) {
  return key.startsWith("W") ? `Week ${key.slice(1)}` : ROUND_NAMES[key] ?? key;
}

// Default to the most recent week that has results, so there are kicks to show.
function currentWeekKey(games) {
  const played = games.filter((g) => g.home_score !== null);
  return weekKey(played.length ? played[played.length - 1] : games[0]);
}

function formatDate(gameday, gametime) {
  const d = new Date(`${gameday}T12:00:00Z`);
  const date = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return gametime ? `${date} · ${gametime} ET` : date;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* ---------- Schedule view ---------- */

function renderSchedule() {
  const { games } = state.data;
  const list = games.filter(
    (g) =>
      weekKey(g) === state.week &&
      (!state.team || g.home_team === state.team || g.away_team === state.team)
  );

  if (!list.length) {
    $("#schedule-view").innerHTML = `<p class="empty">No games for this selection.</p>`;
    return;
  }

  $("#schedule-view").innerHTML = `<div class="games">${list.map(gameCard).join("")}</div>`;
}

function gameCard(g) {
  const played = g.home_score !== null;
  const cls = (mine, theirs) => (!played ? "" : mine > theirs ? "winner" : mine < theirs ? "loser" : "");
  const weather =
    g.roof === "dome" || g.roof === "closed"
      ? "Indoors"
      : [g.temp != null && `${g.temp}°F`, g.wind != null && `wind ${g.wind} mph`].filter(Boolean).join(", ");
  const venue = [g.stadium, g.surface, weather].filter(Boolean).join(" · ");

  const kicks = g.field_goals.length
    ? `<ul class="kicks">${g.field_goals
        .map(
          (k) => `<li>
            <span class="when">${k.qtr > 4 ? "OT" : `Q${k.qtr}`} ${esc(k.time ?? "")}</span>
            <span>${esc(k.kicker)} <small style="color:var(--muted)">${esc(k.team)}</small></span>
            <span class="dist">${k.distance} yd</span>
            <span class="pill ${esc(k.result)}">${esc(k.result)}</span>
          </li>`
        )
        .join("")}</ul>`
    : `<p class="none">${played ? "No field goal attempts." : "Not played yet."}</p>`;

  const made = g.field_goals.filter((k) => k.result === "made").length;
  const fgSummary = g.field_goals.length ? `FG ${made}/${g.field_goals.length}` : "";

  return `<article class="game">
    <div class="game-meta"><span>${formatDate(g.gameday, g.gametime)}</span><span>${fgSummary}</span></div>
    <div class="matchup">
      <span class="team ${cls(g.away_score, g.home_score)}">${esc(g.away_team)}</span>
      <span class="score ${cls(g.away_score, g.home_score)}">${played ? g.away_score : ""}</span>
      <span class="team ${cls(g.home_score, g.away_score)}">@ ${esc(g.home_team)}</span>
      <span class="score ${cls(g.home_score, g.away_score)}">${played ? g.home_score : ""}</span>
    </div>
    <div class="venue">${esc(venue)}</div>
    ${kicks}
  </article>`;
}

/* ---------- Kickers view ---------- */

const BUCKETS = [
  ["0-39", (d) => d < 40],
  ["40-49", (d) => d >= 40 && d < 50],
  ["50+", (d) => d >= 50],
];

function kickerStats() {
  const byKicker = new Map();
  for (const g of state.data.games) {
    for (const k of g.field_goals) {
      if (state.team && k.team !== state.team) continue;
      const id = k.kicker_id ?? k.kicker;
      if (!byKicker.has(id)) {
        byKicker.set(id, { kicker: k.kicker, teams: new Set(), att: 0, made: 0, blocked: 0, long: 0, b: BUCKETS.map(() => [0, 0]) });
      }
      const s = byKicker.get(id);
      s.teams.add(k.team);
      s.att++;
      if (k.result === "blocked") s.blocked++;
      if (k.result === "made") {
        s.made++;
        s.long = Math.max(s.long, k.distance);
      }
      BUCKETS.forEach(([, test], i) => {
        if (test(k.distance)) {
          s.b[i][1]++;
          if (k.result === "made") s.b[i][0]++;
        }
      });
    }
  }
  return [...byKicker.values()].map((s) => ({
    ...s,
    team: [...s.teams].join("/"),
    pct: s.att ? s.made / s.att : 0,
  }));
}

const COLUMNS = [
  ["kicker", "Kicker"],
  ["team", "Team"],
  ["made", "FGM"],
  ["att", "FGA"],
  ["pct", "FG%"],
  ["long", "Long"],
  ["b0", "0-39"],
  ["b1", "40-49"],
  ["b2", "50+"],
  ["blocked", "Blk"],
];

function renderKickers() {
  const { key, dir } = state.sort;
  const sortVal = (r) => (key.startsWith("b") ? r.b[+key[1]][0] : r[key]);
  const rows = kickerStats()
    .filter((r) => r.att >= state.minAtt)
    .sort((a, b) => {
      const va = sortVal(a), vb = sortVal(b);
      if (typeof va === "string") return dir * va.localeCompare(vb);
      return dir * (va - vb) || b.att - a.att;
    });

  if (!rows.length) {
    $("#kickers-view").innerHTML = `<p class="empty">No kickers match these filters.</p>`;
    return;
  }

  const head = COLUMNS.map(
    ([k, label]) =>
      `<th data-key="${k}" ${k === key ? `aria-sort="${dir < 0 ? "descending" : "ascending"}"` : ""}>${label}</th>`
  ).join("");
  const body = rows
    .map(
      (r) => `<tr>
        <td>${esc(r.kicker)}</td><td>${esc(r.team)}</td>
        <td>${r.made}</td><td>${r.att}</td><td>${(r.pct * 100).toFixed(1)}%</td><td>${r.long || "–"}</td>
        ${r.b.map(([m, a]) => `<td>${a ? `${m}/${a}` : "–"}</td>`).join("")}
        <td>${r.blocked}</td>
      </tr>`
    )
    .join("");

  $("#kickers-view").innerHTML = `<div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  $("#kickers-view").querySelectorAll("th").forEach((th) =>
    th.addEventListener("click", () => {
      const k = th.dataset.key;
      state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : k === "kicker" || k === "team" ? 1 : -1 };
      renderKickers();
    })
  );
}

/* ---------- Wiring ---------- */

function render() {
  const isSchedule = state.view === "schedule";
  $("#schedule-view").hidden = !isSchedule;
  $("#kickers-view").hidden = isSchedule;
  $("#week-filter").hidden = !isSchedule;
  $("#min-att-filter").hidden = isSchedule;
  document.querySelectorAll(".tabs button").forEach((b) =>
    b.setAttribute("aria-selected", String(b.dataset.view === state.view))
  );
  isSchedule ? renderSchedule() : renderKickers();
}

async function init() {
  try {
    const res = await fetch("data/field_goals.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.statusText);
    state.data = await res.json();
  } catch (err) {
    $("#updated").textContent = "Couldn't load data. Run `npm run data` first.";
    console.error(err);
    return;
  }

  const { games, season, generated_at } = state.data;
  $("#season-label").textContent = season;
  $("#updated").textContent = `Updated ${new Date(generated_at).toLocaleString()}`;

  const weeks = [...new Set(games.map(weekKey))];
  $("#week").innerHTML = weeks.map((w) => `<option value="${w}">${weekLabel(w)}</option>`).join("");
  state.week = currentWeekKey(games);
  $("#week").value = state.week;

  const teams = [...new Set(games.flatMap((g) => [g.home_team, g.away_team]))].sort();
  $("#team").insertAdjacentHTML("beforeend", teams.map((t) => `<option>${t}</option>`).join(""));

  $("#week").addEventListener("change", (e) => { state.week = e.target.value; render(); });
  $("#team").addEventListener("change", (e) => { state.team = e.target.value; render(); });
  $("#min-att").addEventListener("input", (e) => { state.minAtt = Number(e.target.value) || 0; render(); });
  document.querySelectorAll(".tabs button").forEach((b) =>
    b.addEventListener("click", () => { state.view = b.dataset.view; render(); })
  );

  render();
}

init();
