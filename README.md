# Conquest

A hex-grid turn-based strategy game. Play locally (hotseat) or online (lobbies, multiplayer, bots).

The whole project is an npm-workspaces monorepo built around one idea: **a single deterministic game engine, shared byte-for-byte between the client and the server**. Both sides replay the exact same reducer, so an online game stays in sync without the server ever sending anything but state.

> Note: the source code comments and the in-game UI are written in **French** — that convention is intentional and should be kept. This README is the English entry point.

---

## Table of contents

- [Gameplay](#gameplay)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Commands](#commands)
- [Architecture](#architecture)
  - [The shared engine](#the-shared-engine-single-source-of-truth)
  - [Front end](#front-end-one-game-ui-two-interchangeable-sessions)
  - [Back end](#back-end-server-authoritative-online-play)
  - [Socket protocol](#socket-protocol)
- [Testing](#testing)
- [Balance tooling](#balance-tooling)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Contributing conventions](#contributing-conventions)

---

## Gameplay

Each player owns a base on a hex map and expands by moving soldiers onto neighbouring cells. Territory generates gold, gold buys units, units take territory.

**Economy**
- Each player starts with **75 gold** and earns a **base income of 10/turn**, plus territory.
- Every **house** owned adds **+5 gold/turn**.
- Every unit costs **upkeep** each turn, deducted from income: soldiers cost 2 / 4 / 8 / 16 / 32 by level, towers 4, summoned skeletons 1 (8 for the Warlock's). Houses have *negative* upkeep — they pay you.

**Units**
- Soldiers move up to **2 steps** per turn and have stats by level (atk/hp): 1/2, 2/4, 4/8, 8/16, 16/16. Attack doubles each level; hit points cap at level 4, so level 5 trades sturdiness for raw damage.
- Two soldiers of the **same level** and the **same bonus** (or both with none) can **merge** into one of the next level, up to level **5**.
- **Towers** (attack / defense) are cheaper to keep than a soldier of the same price but cannot move.

**Affinities**
- Three elemental affinities: **fire, ice, lightning**. Merging two different elements produces the *third* one; merging identical ones keeps it.
- **Shield** is a separate affinity: it cannot attack or be attacked by another shield or by a unit with no affinity — it only fights the three elements. It loses to an element on merge.

**World events**
- **Trees** spawn over time (capped at ~10% of the map). A soldier adjacent to one can chop it for **+10 gold**, but trees on your territory cost upkeep.
- **Chests** spawn and can be opened for loot (items, affinities).

**Bonuses** are per-soldier specialisations bought in the shop (Woodcutter, Paladin, Warlock, Alchemist, Priest, Magician…), each with a price, an upkeep and an optional **challenge** to unlock it. Every bonus can be individually disabled or made challenge-free in the game settings.

**Victory** is configurable: `elimination` (default), `domination` (control 60% of the playable territory) or `economy` (a gold race to 2000).

Almost every number above is a **setting** with a sane default (`shared-engine/engine/settings.js`) and can be tuned per game from the offline setup screen.

---

## Repository layout

```
conquest-online-game/
├── shared-engine/      @conquest/shared-engine — deterministic engine (pure JS, no framework)
│   ├── engine/         reducer, actions, rules, selectors, rng, serialize, settings, bot/
│   ├── data/           maps, soldiers, items, terrain, chests, hex geometry, colors
│   ├── balance/        static balance reports + bot benchmark
│   ├── demo/           scripted demo scenarios
│   ├── render/         headless render helpers
│   └── test/           node:test suites + golden.json fingerprints
├── conquest-front/     React 18 + Vite + Sass client
│   └── src/            App.jsx, GameLayout.jsx, game/, menu/, wiki/, demo/, styles/
├── conquest-back/      Express + socket.io + MongoDB game server
│   └── online/         gameSocket.js, lobbyStore.js, bot.js, db.js, exportEngine.js
├── map-editor/         standalone static map editor (own README)
├── render.yaml         Render blueprint (back end)
└── package.json        workspaces + all scripts
```

---

## Getting started

Requirements: **Node 22** (see `.nvmrc`) and, for online play, a reachable **MongoDB**.

```bash
npm install
```

This installs every workspace and symlinks `@conquest/shared-engine` into the front and the back.

Run the client:

```bash
npm run dev
```

Vite serves the front on <http://localhost:5173>. Offline (hotseat) play works with nothing else running.

Run the server (needed for online play):

```bash
npm start
```

Express + socket.io listen on port 3000. **The server exits at startup if MongoDB is unreachable.** The quickest local database:

```bash
docker run -d -p 27017:27017 --name conquest-mongo mongo:7
```

---

## Commands

All from the repo root:

| Command | What it does |
| --- | --- |
| `npm install` | Install all workspaces, symlink the shared engine |
| `npm run dev` | Front dev server (Vite, port 5173) |
| `npm start` | Back server (port 3000, requires MongoDB) |
| `npm run build` | Front production build |
| `npm run lint` | ESLint on `conquest-front` |
| `npm test` | Engine tests (`node:test`, `shared-engine/test/`) |
| `npm run balance` | Static balance table (costs, upkeeps, drop rates) |
| `npm run bonus` | Per-bonus sheet (price, real gold/turn, challenge, effect) |
| `npm run botstats` | Bot benchmark: bot-vs-bot games, measures what the bot actually does |

---

## Architecture

### The shared engine: single source of truth

`shared-engine/engine/reducer.js` is a **pure** `(state, action) -> state` function. *All* game-state mutation lives there and nowhere else. Randomness goes through a seeded PRNG (`engine/rng.js`), so the same seed plus the same action sequence yields byte-identical states on client and server.

**Never duplicate rule logic in the front or the back** — the entire online model depends on both sides replaying the same reducer.

Key modules:

| Module | Role |
| --- | --- |
| `engine/actions.js` | Action creators — the only way to change state. Actions carry *intent* only; the actor is always the active player. |
| `engine/reducer.js` | The pure reducer |
| `engine/board.js` | Initial state construction |
| `engine/rules.js` | Combat / merge / building constants and formulas |
| `engine/selectors.js` | Derived state: reachability, income, victory |
| `engine/serialize.js` | Wire and persistence format |
| `engine/settings.js` | Configurable per-game settings and their defaults |
| `engine/endturn/`, `engine/turnReset.js` | End-of-turn effects, turn reset |
| `engine/bot/` | Bot decision logic (conquest, offense, threat, affinities, bonuses…) |
| `data/` | Maps, soldiers, items, terrain, hex geometry |

Available actions: `MOVE_SOLDIER`, `MERGE_SOLDIER`, `ATTACK_SOLDIER`, `CHOP_TREE`, `OPEN_CHEST`, `PLACE_ITEM`, `BUY_BONUS`, `SET_BEHAVIOR`, `END_TURN`, plus the server-only `SET_MAP` and `RESET_GAME`.

### Front end: one game UI, two interchangeable sessions

`App.jsx` is a minimal screen router (home / offline setup / game / online). `GameLayout.jsx` renders the game and consumes a **session object** passed as a prop:

```js
{ state, dispatch, mode, localPlayerId, isMyTurn, ready }
```

Two implementations satisfy that contract:

- **`useGameSession`** (`src/game/session/useGameSession.js`) — local hotseat, a plain `useReducer` over the shared reducer.
- **`useOnlineSession`** (`src/game/session/useOnlineSession.js`) — owns the **single** socket.io connection that must live from lobby browsing through the end of the game (recreating it loses the player's seat). `dispatch` emits actions to the server; state arrives via `game:state` (server-authoritative), applied optimistically locally and rolled back on `game:rejected`.

Display components never know which mode they are in.

### Back end: server-authoritative online play

`bin/www` boots HTTP + socket.io after connecting to MongoDB. `online/gameSocket.js` is the transport layer; clients send *intentions*, and the server:

1. validates the action (must be in `CLIENT_ALLOWED_ACTIONS`, and must come from the seated active player),
2. applies the shared reducer,
3. persists via `online/lobbyStore.js` (MongoDB `lobbies` collection),
4. broadcasts the serialized state to the room.

`online/bot.js` picks actions for bot seats. `online/exportEngine.js` re-exports the shared engine — **the server must import engine modules only, never React-dependent files**.

### Socket protocol

Documented in full in the header of `conquest-back/online/gameSocket.js`.

Client → server:

| Event | Payload | Notes |
| --- | --- | --- |
| `lobby:create` | `{ mapId?, settings?, name?, color? }` | Emitter becomes host |
| `lobby:list` | — | Request open games |
| `lobby:join` | `{ code, name?, color? }` | Take a free seat, or spectate |
| `lobby:leave` | — | Back to the list |
| `lobby:identity` | `{ name?, color? }` | Change own name/colour |
| `lobby:configure` | `{ code, mapId?, settings? }` | Host only, before start |
| `lobby:reorder` | `{ code, playerId, direction }` | Host only |
| `lobby:seatkind` | `{ code, playerId, kind }` | Host only, `human` / `bot` |
| `lobby:botdifficulty` | `{ code, playerId, difficulty }` | Host only |
| `lobby:start` | `{ code }` | Host only |
| `game:action` | *action* | Play a game action |
| `game:reset-turn` | — | Active player restarts their own turn |

Server → client: `lobby:list`, `lobby:joined`, `lobby:left`, `lobby:update`, `lobby:error`, `game:state`, `game:rejected`.

---

## Testing

```bash
npm test
```

Tests cover the **shared engine only** (`shared-engine/test/`, `node:test`, zero dependencies): determinism/golden fingerprints, end-of-turn effects, turn reset, merge progress, bonuses, recording. Nothing covers the front or the back — changes there are verified by running the app.

Always go through `npm test`. Invoking the runner directly requires the quoted glob it uses (`node --test "shared-engine/test/*.test.js"`), which Node expands itself; passing a directory (`node --test shared-engine/test/`) fails on Node 24 + Windows.

**About `determinism.test.js`:** it asserts *fingerprints of the final state*, not rules. A failure means the engine's observable behaviour changed — which may well be intentional. If it is, re-record and read the `golden.json` diff carefully; an unintended change there silently desynchronises online games.

```bash
UPDATE_GOLDEN=1 npm test
```

PowerShell:

```bash
$env:UPDATE_GOLDEN=1; npm test
```

---

## Balance tooling

`npm run balance` and `npm run bonus` print static tables (costs, upkeeps, drop rates; per-bonus price, real gold/turn, challenge, effect).

`npm run botstats` is different: tests say the bot is *correct*, botstats says what it actually **does**. It plays deterministic bot-vs-bot games (`shared-engine/balance/botMetrics.js`) on the three test maps (60/180/300 cells, `data/testMaps.js`), 10 games each, 100-turn cap, difficulty « Débutant ». The same command twice yields the same table, so any difference is attributable to the constant you changed.

Flags: `-- --games 50`, `-- --turns 200`, `-- --maps test-small`, `-- --seed 100`, `-- --csv`.

The method that works: **save the report, apply your change, run again, diff the two.** The per-bonus block (share of games with a purchase, purchases/game, average turn of first purchase) tells you whether a new routine actually fires; the game block (houses, soldiers, chops, merges, attacks, unspent gold, cells controlled) tells you what it cost the rest of the turn.

Two limits, or the numbers get read for more than they say:

- **It measures behaviour, not strength.** Both sides run the same bot and games rarely finish inside the turn cap, so "cells controlled at the end" is a near-tie by construction. There is no win rate here, and nothing in this repo produces one. A routine that fires often is not thereby a routine that wins.
- **Unspent gold is huge** (thousands per game): the bot is nowhere near gold-limited on these maps. A purchase that looks "affordable" in the report proves nothing about affordability in a real game, where shop pressure is real.

Small samples overfit — a few tenths of difference on 10 games/map is noise. Re-run with `--games 50` before believing it.

---

## Configuration

**Back end** (`conquest-back/.env`, loaded via dotenv):

| Variable | Default | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | MongoDB connection string |
| `MONGODB_DB` | `conquest` | Database name |
| `PORT` | `3000` | HTTP/socket.io port |

**Front end** (Vite env):

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_SERVER_URL` | `http://localhost:3000` | Where the client looks for the game server |

---

## Deployment

- **Front → Vercel.** `conquest-front/vercel.json` sets the Vite framework preset and an SPA rewrite. `@rollup/rollup-linux-x64-gnu` sits in the root `optionalDependencies` because the Vercel Linux build needs it.
- **Back → Render.** `render.yaml` installs at the repo root (so npm creates the workspace symlink) and starts `npm start -w conquest-back`. `MONGODB_URI` and `MONGODB_DB` are marked `sync: false` — set them in the Render dashboard, never in the repo.

---

## Contributing conventions

- **Rules live in the engine.** If a change touches game rules, it belongs in `shared-engine/` — not in a component and not in a socket handler.
- **Comments and UI text in French.** Match the surrounding code's comment density and naming.
- **Keep the engine framework-free.** No React, no Express, no socket.io inside `shared-engine/`.
- **Run `npm test` before committing**, and read any `golden.json` diff line by line.
- **Judge bot changes with `npm run botstats`**, diffing a before/after report — not by eyeballing a game.
