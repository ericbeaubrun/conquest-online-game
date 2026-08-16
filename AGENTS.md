# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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
```

The back server exits at startup if MongoDB is unreachable. Local Mongo: `docker run -d -p 27017:27017 --name conquest-mongo mongo:7`, or set `MONGODB_URI` / `MONGODB_DB` (loaded from `conquest-back/.env` via dotenv). The front finds the server via `VITE_SERVER_URL` (default `http://localhost:3000`).

Tests cover the **shared engine only** (`shared-engine/test/`, `node:test`, no dependency): determinism/golden fingerprints, end-of-turn effects, and turn reset. Nothing covers the front or the back — a change there is verified by running the app.

Always run them through `npm test`. Invoking the runner directly needs the quoted glob it uses (`node --test "shared-engine/test/*.test.js"`), which Node expands itself; passing the directory (`node --test shared-engine/test/`) fails on Node 24 + Windows.

`determinism.test.js` asserts **fingerprints of the final state**, not rules: a failure means the engine's observable behaviour changed, which may be intentional. If it is, re-record with `UPDATE_GOLDEN=1 npm test` (PowerShell: `$env:UPDATE_GOLDEN=1; npm test`) and read the `golden.json` diff carefully — an unintended change there desynchronises online games silently.

## Architecture

### The shared engine is the single source of truth for game rules

`shared-engine/engine/reducer.js` is a **pure** `(state, action) -> state` function; all game-state mutation lives there and nowhere else. Randomness goes through a seeded PRNG (`engine/rng.js`), so given the same seed and action sequence, client and server compute byte-identical states. Never duplicate rule logic in the front or back — the whole online model depends on both sides replaying the exact same reducer.

**Bot AI — blank slate on this branch**: `engine/bot/` holds no decision logic, only the entry point (`isBotTurn`, plus a `runBotTurn` that does nothing, so bot seats pass their turn). All the plumbing around it is intact — bot seats/difficulties, the offline driver in `useGameSession`, `advanceBots` in `gameSocket.js`, the speed slider, `npm run botstats`. Read the contract at the top of `engine/bot/index.js` before writing a routine: work from the state returned by `apply`, never play `endTurn` (the callers do), stay deterministic, no React/Node imports.

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
