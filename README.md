# NFL Field Goals

The NFL schedule combined with every field goal attempt, built from free
[nflverse](https://github.com/nflverse) data and hosted on GitHub Pages.

- **Schedule view:** pick a week and team to see each game's score, venue, weather and every field goal attempt (quarter, kicker, distance, result). Upcoming fixtures show each team's average field goals made per game this season, split by home, away and all games, with the split that applies to that fixture highlighted. Neutral-site games count only toward the "all" average.
- **Kickers view:** sortable season leaderboard with FG%, long, and splits by distance (0-39, 40-49, 50+).

Plain JavaScript with no dependencies and no build step.

## How it works

1. `scripts/build-data.mjs` downloads the nflverse schedule (`games.csv`) and the season's play-by-play (`play_by_play_<season>.csv.gz`), keeps only field goal plays, joins them to games on `game_id`, and writes `public/data/field_goals.json` (about 175 KB).
2. `.github/workflows/deploy.yml` runs that script on every push to `main` and daily at 10:17 UTC, then deploys `public/` to GitHub Pages.

The browser only loads the small JSON file. The 11 MB play-by-play file is processed in Actions, which also avoids CORS limits on GitHub release downloads.

## Run locally

Requires Node 18 or later.

```bash
npm run dev          # build the data, then serve at http://localhost:8080
npm run data         # rebuild data only (current season)
npm run data -- 2025 # a specific season
npm run serve        # serve only
```

## Deploy to GitHub Pages (one-time setup)

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The workflow runs on the push (or run it from the **Actions** tab with **Run workflow**). The site will be at `https://<your-user>.github.io/<repo-name>/`.

Scheduled workflows run only on the default branch. GitHub pauses them after 60 days without repository activity, and you can re-enable them from the Actions tab.

## Data fields

Each game in `field_goals.json`:

| Field | Notes |
|---|---|
| `game_id`, `game_type`, `week`, `gameday`, `gametime` | `game_type` is REG, WC, DIV, CON or SB; `gametime` is US Eastern |
| `away_team`, `home_team`, `away_score`, `home_score` | Scores are `null` until the game is played |
| `location`, `has_pbp` | `location` is Home or Neutral; `has_pbp` is true once play-by-play exists for the game |
| `stadium`, `roof`, `surface`, `temp`, `wind` | Weather fields are `null` for domes and unplayed games |
| `field_goals[]` | `qtr`, `time`, `team`, `opponent`, `kicker`, `kicker_id`, `distance`, `result` (made, missed or blocked), `score_diff` (kicking team's margin before the kick) |

## Data source and freshness

All data comes from nflverse and is free to use. nflverse play-by-play is usually updated overnight after games, so this site is not live during games. Check the licence of each nflverse dataset before using the data commercially.
