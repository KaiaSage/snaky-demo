# Text play worker

A Cloudflare Worker that lets an AI agent (or anyone) play Snaky in 21 with nothing but GET requests:
no JavaScript, no cloning. Black is deterministic, so the whole game lives in the URL as White's moves,
two SGF letters each (`w=kjjhij` is L10, K12, J10).

| URL | What it returns |
|---|---|
| `/` | Rules and a start link |
| `/play?w=&links=0` | A new game, short page; play by adding `&move=K11` (recommended for agents) |
| `/play?w=` | A new game with a link for every legal reply |
| `/play?w=…&move=K11` | Same as appending K11 to `w` |
| `&glass=1` | Adds the strategy view: cost of your last reply, Black's cards, replies that keep the best finish |
| `&links=0` | Drops the move links (for agents that can build URLs themselves) |

Without `links=0`, every page lists a link per empty point, because many agent fetch tools only follow URLs they
have already seen. Pages use short labelled lines (`STATUS:`, `SUMMARY:`, `POSITION URL:`, …) with each URL on its own
line, because some fetch tools only quote short lines verbatim and paraphrase the rest. Error pages are 400s that link
back to the last valid position. The glass view also lists Black's threats and any win Black has passed over: Black only plays its current
card's next stone, so it can leave a finished shape one move away for many turns.
Responses are plain text, cacheable (the same URL always gives the same page), and CORS-open.

## Deploy

Option A, no tooling: in the Cloudflare dashboard, Workers & Pages → Create → Worker → Deploy the hello-world,
then Edit code, replace everything with the contents of `dist/worker.js`, and Deploy.

Option B, Wrangler:

```
cd worker
npx wrangler deploy
```

Either way you get `https://snaky-textplay.<your-subdomain>.workers.dev/`. Point an agent at that root URL.

The engine loads the full certificate once per isolate (about 150 ms, at startup); each request then takes a few
milliseconds, inside the free plan's per-request CPU limit.

## Develop

`dist/worker.js` is generated: edit `handler.js` (or the engine in `../js/`), then

```
node build.mjs && node test.mjs
```

The test follows links the way an agent would, replays a known game, and plays a perfect defense from the glass view.
