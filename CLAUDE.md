# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Conquest — a hex-grid turn-based strategy game, playable offline (hotseat) or online (lobbies, multiplayer with bots). npm-workspaces monorepo, three workspaces:

- `shared-engine/` — `@conquest/shared-engine`, the deterministic game engine (pure JS, no framework deps), imported by both front and back.
- `conquest-front/` — React 18 + Vite + Sass client.
- `conquest-back/` — Express + socket.io + MongoDB game server.

Code comments and UI text are in **French** — keep that convention.

## Commands

Run from the repo root (Node 22, see `.nvmrc`):

```
npm install          # installs all workspaces + symlinks @conquest/shared-engine
npm run dev          # front dev server (Vite, port 5173)
npm start            # back server (port 3000) — requires MongoDB
npm run build        # front production build
npm run lint         # eslint on conquest-front
npm test             # engine tests (node:test) — shared-engine/test/
npm run arena        # bot bench: bots play each other (shared-engine/balance/)
npm run balance      # static balance table (costs, upkeeps, drop rates)
npm run replay       # replay a recorded game (see the recording workflow)
```

The back server exits at startup if MongoDB is unreachable. Local Mongo: `docker run -d -p 27017:27017 --name conquest-mongo mongo:7`, or set `MONGODB_URI` / `MONGODB_DB` (loaded from `conquest-back/.env` via dotenv). The front finds the server via `VITE_SERVER_URL` (default `http://localhost:3000`).

Tests cover the **shared engine only** (`shared-engine/test/`, `node:test`, no dependency): determinism/golden fingerprints, end-of-turn effects, and turn reset. Nothing covers the front or the back — a change there is verified by running the app.

Always run them through `npm test`. Invoking the runner directly needs the quoted glob it uses (`node --test "shared-engine/test/*.test.js"`), which Node expands itself; passing the directory (`node --test shared-engine/test/`) fails on Node 24 + Windows.

`determinism.test.js` asserts **fingerprints of the final state**, not rules: a failure means the engine's observable behaviour changed, which may be intentional. If it is, re-record with `UPDATE_GOLDEN=1 npm test` (PowerShell: `$env:UPDATE_GOLDEN=1; npm test`) and read the `golden.json` diff carefully — an unintended change there desynchronises online games silently.

### Judging a bot change

Tests say a bot is *correct*; only `npm run arena` says it is *stronger*. All its drivers are deterministic, so the same command twice gives the same table — any difference is attributable to the setting you touched.

- `npm run arena -- --ladder` — the difficulty ladder alone, judged against its target: **a level must not take more than 2 games out of 10 from the level above it**. Exits non-zero when the ladder does not hold.
- `npm run arena -- --spend` — the same matches, plus each driver's spending broken down by purchase family (soldiers / buildings / bonuses / affinities) and the gold it never spent. This is how a purchase family gets opened without the bot quietly furnishing the map: open one switch in `engine/ai/search.js`, then check the share it eats.
- `npm run arena -- lab lab2 --lab useBonuses --lab2 beamWidth=3` — try settings **without touching the catalogue**. `lab` and `lab2` are the common base plus whatever `--lab` / `--lab2` override; `plain` is the fixed control. Never deform a shipped profile to measure: it ships a level that plays worse than the one below it the day you forget to undo it.

Two traps this bench has already sprung, both costly:

- **Overfitting.** A setting that scored 10 wins out of 10 on five seeds scored 16 out of 20 on ten. Validate a ladder setting on **20 games** (`--games 10`), never 10.
- **Non-transitivity.** What beats the base does not necessarily beat a handicapped opponent — bonuses win 7/10 against a full-width search and lose 5/10 against a narrow one. Tune a rung by configuring *both* sides, which is what `lab2` is for.

## Architecture

### The shared engine is the single source of truth for game rules

`shared-engine/engine/reducer.js` is a **pure** `(state, action) -> state` function; all game-state mutation lives there and nowhere else. Randomness goes through a seeded PRNG (`engine/rng.js`), so given the same seed and action sequence, client and server compute byte-identical states. Never duplicate rule logic in the front or back — the whole online model depends on both sides replaying the exact same reducer.

Key engine modules: `engine/actions.js` (action creators — the only way to change state; actions carry *intent* only, the actor is always the active player), `engine/board.js` (initial state), `engine/rules.js` (combat/merge/building constants and formulas), `engine/selectors.js` (derived state: reachability, income, victory), `engine/serialize.js` (wire/persistence format), `engine/settings.js`, and `data/` (maps, soldiers, items, terrain, hex geometry).

### Front: one game UI, two interchangeable sessions

`App.jsx` is a minimal screen router (home / offline setup / game / online). `GameLayout.jsx` renders the game and consumes a **session object** injected as a prop — `{ state, dispatch, mode, localPlayerId, isMyTurn, ready }`:

- `useGameSession` (`src/game/session/useGameSession.js`): local hotseat, plain `useReducer` over the shared reducer.
- `useOnlineSession` (`src/game/session/useOnlineSession.js`): owns the **single** socket.io connection that must live from lobby browsing through the game (recreating it loses the player's seat). `dispatch` emits actions to the server; state updates arrive via `game:state` (server-authoritative), with optimistic local application and rollback on `game:rejected`.

Display components don't know which mode they're in.

### Back: server-authoritative online play

`bin/www` boots HTTP + socket.io (connects to MongoDB first). `online/gameSocket.js` is the transport layer and documents the full socket protocol (`lobby:*` / `game:*` events) in its header comment. Clients send intentions; the server validates (only actions in `CLIENT_ALLOWED_ACTIONS`, only from the seated active player), applies the shared reducer, persists via `online/lobbyStore.js` (MongoDB `lobbies` collection), and broadcasts the serialized state. `online/bot.js` picks actions for bot seats. `online/exportEngine.js` re-exports the shared engine — the server must import engine modules only (never React-dependent files).

### Deployment

Front on Vercel (`conquest-front/vercel.json`, SPA rewrite), back on Render (`render.yaml` — installs at repo root so the workspace symlink exists, then `npm start -w conquest-back`). `@rollup/rollup-linux-x64-gnu` in root `optionalDependencies` is required for the Vercel Linux build.
