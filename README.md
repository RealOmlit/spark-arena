# Spark Arena

**Play now: [Spark Arena on GitHub Pages](https://realomlit.github.io/spark-arena/)**

The GitHub Pages edition is a complete browser game: choose a quiz, answer questions, read explanations, build streaks, buy upgrades and attacks, and compete against three clearly labeled computer rivals. It needs no login or server. It is solo play, not multiplayer. Answer keys and scores are local and inspectable; personal bests are stored only in your browser. Backgrounding the tab pauses the game. Reloading ends the current solo session.

### GitHub Pages deployment

The `static/` directory contains the browser edition (`index.html`, `app.js`, and `engine.js`). `npm run build:pages` compiles Tailwind and copies the game, favicon, and quiz catalog into the ignored `pages-dist/` build directory. The `.github/workflows/pages.yml` workflow verifies the code and deploys that directory on every push to `main`. In repository **Settings → Pages → Source**, select **GitHub Actions**. Publishing the repository root directly shows this README instead of the game. All asset paths are relative so the game works under `/spark-arena/`.

To preview the browser edition locally, run `npm ci`, then `npm run build:pages`, and serve `pages-dist/` with any local static HTTP server. The Node multiplayer implementation below remains available for deployment to a persistent Node host.

A real-time classroom quiz platform with a shared timer, individual question streams, a competitive Spark Points economy, and a live power-up shop. Built with **Node.js + Express + Socket.IO**, vanilla JavaScript, and locally compiled **Tailwind CSS 4**. No CDN scripts, frontend framework, account signup, or database required.

## Quick start

Install Node.js **22.9+** (Node 24 recommended) and npm. From this directory:

```sh
npm install
```

Create your local configuration:

```sh
# macOS / Linux
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

Then:

```sh
npm run dev
```

Open **http://localhost:3000**. Choose a quiz and click **Host game**. Open a second browser tab, click **Join a game**, enter the six-digit code and a nickname. Start the game from the teacher tab. Use additional tabs or devices for more players.

For devices on the same Wi-Fi, use your computer's LAN address, e.g. `http://192.168.1.20:3000`. Set `APP_ORIGIN` to that exact URL in `.env`, restart, and use the same URL on **all** devices, including the host. The server checks browser origins. Allow the Node server through your local firewall if required.

`npm run dev` builds CSS once and restarts Node when server files change. Refresh the browser for client edits. Run `npm run build` after changing HTML/JS utility classes or `client/styles.css`; for continuous CSS compilation run `npx @tailwindcss/cli -i ./client/styles.css -o ./public/styles.css --watch` in a second terminal.

## How to play

1. Teacher selects Science Sparks, Number Rush, or World Explorer; chooses 3, 5, or 10 minutes; and optionally disables sabotage.
2. Players join the lobby. Nicknames are unique within an arena. New players cannot join after the game starts; existing players can reconnect.
3. Teacher starts the arena. Each player receives their own shuffled questions and answer choices. Questions repeat in shuffled cycles once a set is exhausted.
4. Correct answers earn currency. Players can spend their balance on upgrades, shields, and attacks while the arena is live.
5. Teacher can pause/resume/end. Time expiration ends the arena automatically. Final results show rank, accuracy, and best streak.

Rank uses **current balance**, with correct answers as the first tie-breaker and nickname as the final tie-breaker. Shop purchases cost leaderboard points, so players must decide whether an investment will pay off before time runs out.

### Economy

```text
streakMultiplier = 1 + min(streak - 1, 5) × (0.2 + 0.1 × streakUpgradeLevel)
correctReward = round(30 × (1 + 0.25 × boostLevel) × streakMultiplier)
wrongPenalty = min(10, currentBalance)
```

The first correct answer pays 30; subsequent consecutive correct answers pay 36, 42, 48, 54, and 60 at base upgrade levels. The streak contribution caps at five steps; the streak counter can keep growing. A wrong answer resets the streak. Students never get eliminated. Each answer produces an explanation before the next question; server pacing enforces at least 1.5 active seconds between answers.

| Item | Initial price | Behavior |
| --- | ---: | --- |
| Spark reactor | 100 | +25% base reward per level, max 3 |
| Streak amplifier | 120 | +0.1× per streak step per level, max 3 |
| Energy shield | 60 | Blocks the next attack, one shield at a time |
| Ice pulse | 80 | Freezes a connected rival for 5 active seconds |
| Spark siphon | 100 | Removes floor(10% × rival balance); points are not transferred |
| Mind scramble | 70 | Shuffles the rival's current answer positions; answer IDs remain valid |

Upgrade costs are `initialPrice × (currentLevel + 1)`. Purchases have a two-second active-time cooldown. Upgrades last until the arena ends. A shield is consumed by any incoming attack; the attacker still pays. Players cannot answer or shop while frozen. Existing freezes cannot be stacked. No attacks target disconnected players or the purchaser. Focused mode hides and rejects offensive items.

## Architecture

```text
spark-arena/
├── server/
│   ├── index.js         Express HTTP server, security headers, Socket.IO setup
│   ├── socket.js        Event protocol, role checks, recovery, broadcasts, timers
│   ├── game.js          Authoritative room state, scoring, shop, game clock
│   └── quizzes.js       Catalog loading and JSON schema validation
├── data/quizzes.json    Teacher-maintained quiz catalog and answer keys
├── public/
│   ├── index.html       Browser entry point
│   ├── app.js           UI rendering, forms, acknowledgements, session recovery
│   ├── favicon.svg      Brand mark
│   └── styles.css       Generated by npm run build (Git-ignored)
├── client/styles.css    Tailwind import, responsive theme, animations
├── test/
│   ├── game.test.js     Deterministic game/economy tests with an injected clock
│   └── socket.test.js   Real HTTP + Socket.IO multiplayer integration test
├── .github/workflows/ci.yml
├── .env.example
├── .gitignore
├── .dockerignore
├── Dockerfile
├── package.json
└── package-lock.json
```

The game engine is independent of HTTP and Socket.IO. `GameStore` holds rooms and players in Maps and uses an injected clock for testing. A room keeps one accumulated active-time clock. Pause freezes the countdown, answer/shop cooldowns, and effects together. A one-second server loop ends games, broadcasts current state, and expires rooms.

Each room broadcasts a public leaderboard, settings, and activity feed. Only the relevant player's socket receives their balance, upgrades, effects, and current question. Answer correctness and explanations are excluded from question payloads. Explanations are returned after a validated submission.

### Reconnection and lifecycle

- Nickname and host recovery use cryptographically random 256-bit tokens. Tokens are sent only to the owning connection and never included in public room snapshots.
- The client stores recovery tokens in **sessionStorage**. Refreshing/reconnecting the original tab restores progress automatically. Explicitly leaving keeps a nickname recovery entry in that tab; rejoining with that name restores the same player. Closing the tab or clearing storage loses recovery. Use a different nickname to join a new player before the game starts.
- A valid recovery token may replace an older connection. The older socket is disconnected without clearing the new socket's ownership.
- Player disconnects preserve balances, question state, and rank. A host disconnect automatically pauses a running room; the recovered host explicitly resumes.
- Ended rooms expire after 30 minutes of inactivity. Other rooms expire after two hours of inactivity. Limits default to 100 rooms and 40 players per room.
- Room state is ephemeral. **A process restart loses all arenas and recovery tokens.** Run one Node process/replica. This is a single-instance deployment design, not a horizontally distributed implementation.

### Socket protocol

Every client event uses an acknowledgement `{ ok: true, ...result }` or `{ ok: false, error }`. The UI times out after five seconds. If an acknowledgement is lost, inspect synchronized state before retrying a purchase.

| Client event | Payload |
| --- | --- |
| `host:create` | `{ quizId, duration: seconds, sabotage: boolean, hostKey }` |
| `host:resume` | `{ code, token }` |
| `host:control` | `{ action: "start" \| "pause" \| "resume" \| "end" }` |
| `player:join` | `{ code, nickname, token?: recoveryToken }` |
| `player:answer` | `{ questionId, choiceId }` |
| `player:buy` | `{ itemId, targetId?: playerId }` |
| `session:leave` | `{}` |

Server events: `room:state`, `player:state`, `player:attack`, `session:replaced`, and `room:expired`. Creation/join acknowledgements return the owning session. HTTP endpoints are `GET /healthz`, `GET /api/quizzes` (metadata only), and `GET /api/config` (non-secret UI configuration).

### Security and classroom controls

- All scores, deductions, multipliers, costs, timing, shields, and attack targets are calculated and checked server-side. Arbitrary client-supplied points or role fields have no effect.
- Unique question and choice IDs prevent replayed answers and use of stale questions. Correct answers stay server-side until the player answers.
- Nicknames allow 2–18 Unicode letters/numbers, spaces, `_`, and `-`, with Unicode normalization and case-insensitive uniqueness. UI strings are escaped; toast messages use `textContent`.
- Role checks bind each action to the current socket's owning host/player. A six-digit code alone grants no teacher controls or access to an existing nickname.
- HTTP request limits, per-socket token-bucket limits, per-IP connection/host-attempt limits, room/player caps, and 16 KB socket messages bound common abuse. Production requires a teacher key. Keep it out of the repository and student devices.
- Helmet sets a same-origin content-security policy. Assets are locally served; no inline scripts or styles are required. Exact browser-origin checking restricts cross-site connections. Node/native clients may omit Origin; origin checking is not authentication.
- Reduced-motion preferences disable shakes/animations. Controls have labels, visible focus outlines, and keyboard support. Sabotage can be disabled by the teacher.

This prevents simple console score manipulation and impersonation without a recovery token. It cannot prove a student solved a question without outside assistance or stop a bot from choosing answers within legal pacing. Public question banks can eventually be memorized. For larger or untrusted audiences, replace the shared teacher key with authenticated teacher accounts, add edge/network rate limiting, and load-test the intended concurrency.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP and Socket.IO port |
| `HOST` | `0.0.0.0` | Bind address; use `127.0.0.1` for local-only access |
| `NODE_ENV` | development | Set `production` for deployment |
| `APP_ORIGIN` | `RENDER_EXTERNAL_URL` or `http://localhost:3000` | Exact browser origin, no trailing slash; required in production outside Render |
| `HOST_KEY` | empty | Teacher key; required with 16+ characters in production |
| `TRUST_PROXY` | `0` | Set `1` only behind exactly one trusted reverse proxy |
| `MAX_ROOMS` | `100` | Arena limit, 1–1000 |
| `MAX_PLAYERS` | `40` | Players per room, 1–200 |

Use a random long `HOST_KEY` in production and share it only with teachers. The environment file is Git-ignored. Browsers never receive the configured key from the server.

## Scripts and verification

```sh
npm run dev       # compile Tailwind, then run Node in watch mode
npm run build     # generate minified public/styles.css
npm run check     # JavaScript syntax checks
npm test          # unit + real Socket.IO integration tests
npm start         # run the server with optional .env
```

The tests cover streak scoring, wrong answers, replay/rapid submissions, hidden answer keys, freezes, shields, drain, scramble, upgrade limits, invalid/atomic purchases, room expiry, nickname recovery, unauthorized host controls, actual multiplayer connections, and host-disconnect pause/recovery. They use test-only quizzes/server sessions and do not require an external service. Browser QA should additionally check two devices, mobile touch controls, brief network loss, a host refresh, and the final leaderboard.

## Deploy to production

### Render preview deployment

The repository includes `render.yaml` for a free, single-instance Docker web service in Singapore. In the [Render dashboard](https://dashboard.render.com), sign in, authorize access to **only this GitHub repository**, select **New → Blueprint**, and select `RealOmlit/spark-arena`. Review the free service and deploy. Render builds the Dockerfile and generates a random `HOST_KEY`; retrieve that teacher key from the service's **Environment** panel and keep it private. The app uses Render's automatically supplied `RENDER_EXTERNAL_URL` as its allowed browser origin, so no guessed URL is needed. `APP_ORIGIN`, if supplied, takes precedence.

The blueprint uses `/healthz`, trusts Render's reverse proxy, and redeploys after GitHub checks pass. Render supplies TLS and the runtime port. After deployment, open the returned HTTPS URL and test a host and student in separate tabs.

Render's free service sleeps after inactivity and is intended for previews, not production. Sleep/restarts clear active rooms. For regular classroom use, upgrade the existing service to an always-on paid instance after reviewing the price; keep one replica. See [Render free service limits](https://render.com/docs/free) and [Render WebSockets](https://render.com/docs/websocket).

Deploy to a **long-running Node service** or VM with WebSocket support. Static-only hosting and per-request serverless functions cannot hold these in-memory Socket.IO rooms. Use **one instance**; do not enable autoscaling, Node cluster mode, or multiple replicas.

### Node service (e.g. a container host or VM)

1. Commit this directory to a GitHub repository; do not commit `.env` or `node_modules`.
2. Set build command to `npm ci && npm run build && npm test`.
3. Set start command to `npm start`.
4. Configure `NODE_ENV=production`, `APP_ORIGIN=https://your-domain.example`, and a random `HOST_KEY` of at least 16 characters. Configure `PORT` if your provider supplies one. Bind to `0.0.0.0`.
5. Terminate TLS at the provider/reverse proxy. Enable WebSocket forwarding and HTTP long-polling on `/socket.io/`. Set proxy idle timeout above 60 seconds. Route all connections to the same instance.
6. Set `TRUST_PROXY=1` only when the application is behind one trusted proxy; do not enable it on an directly internet-accessible origin. If the provider uses a different proxy chain, configure Express trust precisely before deployment.
7. Configure health checks at `/healthz`. Open the HTTPS site and verify host + student flows from separate devices. Ensure a teacher key is required before hosting.

The CSS build needs dev dependencies. Install them at build time, then optionally use `npm prune --omit=dev` for runtime. CI runs installation, syntax checks, build, and tests on each push/pull request.

### Docker

```sh
docker build -t spark-arena .
docker run --rm -p 3000:3000 --env-file .env.production spark-arena
```

Create an untracked `.env.production` containing at least:

```dotenv
NODE_ENV=production
APP_ORIGIN=https://your-domain.example
HOST_KEY=replace-with-a-long-random-teacher-secret
TRUST_PROXY=0
```

Set `TRUST_PROXY=1` when appropriate to your proxy topology. The Dockerfile compiles CSS and runs tests in a build stage, removes dev dependencies, and runs as the unprivileged `node` user. Configure TLS, secrets, health checks, and a single replica with your container host. The image exposes port 3000; restarts interrupt games.

### Scaling beyond one process

A Redis Socket.IO adapter alone does **not** share `GameStore` state. Distributed deployment needs a shared authoritative room store, atomic transactions for answers/purchases, durable recovery sessions, and a single timer owner per room. Long-polling also needs sticky routing. The modular engine provides a place to implement that work; Redis is intentionally not claimed as implemented here.

## Add quiz sets

Edit `data/quizzes.json`, then restart the server. The loader validates the entire catalog and fails startup with an error on malformed content. A quiz needs a unique lowercase/hyphenated ID, metadata, and 2–500 questions. Each question has exactly four distinct nonempty answers and a zero-based `correctIndex`. Keep answer keys in `data/`, never under `public/`.

```json
[
  {
    "id": "my-quiz",
    "title": "My Quiz",
    "subject": "Science",
    "description": "A short description shown in the teacher library.",
    "questions": [
      {
        "prompt": "Which planet is known as the Red Planet?",
        "answers": ["Mars", "Venus", "Jupiter", "Mercury"],
        "correctIndex": 0,
        "explanation": "Iron oxide on its surface gives Mars its reddish colour."
      },
      {
        "prompt": "What is the formula for water?",
        "answers": ["H₂O", "CO₂", "O₂", "NaCl"],
        "correctIndex": 0,
        "explanation": "A water molecule has two hydrogen atoms and one oxygen atom."
      }
    ]
  }
]
```

Only catalog metadata is exposed at `/api/quizzes`. The server shuffles answers and generates fresh IDs for each issued question, so `correctIndex` is never a public client answer position.

## Publish the source to GitHub

From this directory, after creating an empty repository in your own GitHub account:

```sh
git init
git add .
git commit -m "Build Spark Arena classroom multiplayer platform"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/spark-arena.git
git push -u origin main
```

The included lockfile makes `npm ci` reproducible. Tailwind is pinned to 4.3.0, with an `@parcel/watcher` 2.6.0 override to avoid its older vulnerable glob dependency; revisit the override when upgrading Tailwind. Choose a license appropriate to your project before distributing it; no license is assumed on your behalf.

Implementation references: [Socket.IO server options](https://socket.io/docs/v4/server-options/) and [Tailwind CLI](https://tailwindcss.com/docs/installation/tailwind-cli).
