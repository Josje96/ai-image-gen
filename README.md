# AI Image & Video Gen — SiliconFlow harness

A tiny, local, open-source front end for generating images and videos with the
[SiliconFlow](https://siliconflow.com) API. Bring your own API key, pick a model,
type a prompt. No accounts, no backend, no telemetry — it runs entirely on your
machine and your key never leaves the browser.

> Just want to make a few one-off generations? SiliconFlow's own web playground
> is simpler. This exists for folks who want a **local, no-login, forkable** UI —
> a small single-purpose harness you can point at your own key or adapt to
> another provider.

Built with Vue 3 + Vite, run with [Bun](https://bun.sh).

## Quick start

```bash
bun install
bun run dev
```

Open the printed URL (default `http://localhost:5173`), paste your SiliconFlow
API key, and generate. The key is stored only in your browser's `localStorage`.

Get a key at [cloud.siliconflow.com](https://cloud.siliconflow.com).

### Skip pasting the key: use a `.env`

Copy `.env.example` to `.env` and set your key:

```bash
VITE_SILICONFLOW_API_KEY=sk-your-key-here
```

Restart `bun run dev` (Vite reads `.env` at startup) and the key is prefilled,
flagged with a **.env** badge. A key you type into the UI is saved to
`localStorage` and takes precedence on later visits. `.env` is gitignored.

> Heads up: Vite inlines `VITE_`-prefixed vars into the client bundle at build
> time, so this is a local-dev convenience — don't ship a production build made
> with a real key baked in.

## How it works

The browser can't call the SiliconFlow API directly because it doesn't send
permissive CORS headers. In dev, Vite proxies requests: anything hitting
`/api/siliconflow/*` is forwarded to the API host with your `Authorization`
header intact (see [`vite.config.js`](vite.config.js)).

SiliconFlow runs **two separate platforms** with separate accounts and keys:
`api.siliconflow.com` (international, the default) and `api.siliconflow.cn`
(China). A key from one is rejected by the other with a 401. If your key is on
the China platform, set `SILICONFLOW_BASE_URL=https://api.siliconflow.cn` in
your `.env`.

## Image & video modes

Toggle between **Image** and **Video** at the top of the sidebar.

- **Image** (synchronous): pick a model, prompt, size, batch, steps, guidance,
  seed. Ships with Kolors, FLUX.1 schnell/dev, Qwen-Image, SD 3.5 Large.
- **Video** (asynchronous): Wan 2.2 text-to-video and image-to-video. The app
  submits the job and polls until it's ready (renders take a few minutes), then
  plays the result inline. Image-to-video adds a source-image upload.

Either mode has a **custom** toggle so you can paste any model id straight from
the SiliconFlow models page. Preset metadata (sizes, defaults, capabilities)
lives in [`src/models.js`](src/models.js) and
[`src/videoModels.js`](src/videoModels.js).

## Roadmap

- [ ] Prompt history / re-run
- [ ] Deployable build with a small Bun proxy (for non-dev hosting)

## License

MIT
