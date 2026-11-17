# Touch Grass

A browser extension that places a climate insight widget beside an Instagram profile photo. It reads the first 10 accessible posts in grid order, collects their captions and carousel photos, compresses the photos locally, and asks a configurable OpenRouter vision model to describe the visible climate signals.

The companion journal includes personal action logging, week/month/year trends, category filters, notes, and a downloadable Climate Wrapped recap. A separate demo journal contains fictional records. Profile observations never count as your own actions.

## Quick start

Requires Node.js 22.9+ and an OpenRouter API key with credits.

```sh
npm install
cp .env.example .env
```

Edit `.env` in your editor. Add your key and choose an image-capable model with structured output support.

```dotenv
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=google/gemini-2.5-flash
```

The model above is a configurable starting point. Availability, supported parameters, and prices depend on OpenRouter and its providers. The backend requests providers that disallow data collection. If your model has no compatible provider, choose another model. The API key stays in the local backend and never goes into the extension bundle, browser storage, or version control.

```sh
npm run api
```

Keep that terminal running. In a second terminal, build the extension:

```sh
npm run build
```

### Zen / Firefox

1. Open `about:debugging#/runtime/this-firefox` in Zen.
2. Choose **Load Temporary Add-on**.
3. Select `dist/firefox/manifest.json`.
4. Visit Instagram and log in normally. Open a profile page.
5. If necessary, allow Instagram access in the extension's browser permissions and reload the profile.

The Firefox package declares website-content transmission because an analysis sends selected photos and captions to OpenRouter. Collection still starts only after clicking Analyze.

The widget appears next to the profile photo. Temporary Firefox/Zen add-ons are removed when the browser restarts. Load the manifest again after restarting. Persistent installation requires Mozilla signing; the packaged `.xpi` is unsigned. No browser security settings need to be weakened for temporary installation.

Zen uses Firefox add-ons. See [Zen's extension documentation](https://docs.zen-browser.app/user-manual/extensions) and [Mozilla's temporary installation guide](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).

### Comet / Chrome / other Chromium browsers

1. Open `chrome://extensions` in Comet or Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the entire `dist/chromium` folder.
4. Visit an Instagram profile and reload the page if it was already open.

Use the extension toolbar popup to open the journal or OpenRouter settings. See [Chrome's unpacked extension instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

### Explore the interface without installing

```sh
npm run dev
```

Open `http://127.0.0.1:5173`. The browser preview starts with fictional demo records. Use **Start my journal** to switch to an empty personal journal. Profile collection runs only from the installed extension on Instagram.

## Profile analysis workflow

1. The extension watches rendered Instagram profile pages and mounts a widget beside the profile photo. It handles navigation between profiles without requiring a full reload.
2. Click **Analyze first 10 posts**. The widget explains the external upload before collection starts. Opening a profile alone never triggers a paid model request.
3. The collector takes up to 10 distinct `/p/` or `/reel/` links from the grid, preserving grid order. Pinned posts count. It scrolls a bounded distance if fewer than 10 links are initially rendered.
4. One temporary inactive tab at a time opens each post using the browser's existing Instagram session. The collector reads the rendered caption and advances accessible carousel controls, up to 20 slides. Each temporary tab closes after collection, including error paths.
5. Media downloads come only from Instagram CDN domains. Each image is resized to a maximum edge of 448 pixels and encoded as JPEG at quality 0.62. No upscaling. The original aspect ratio is preserved. Large or unreadable media produce collection warnings.
6. Captions stay paired with their posts. The backend submits one multimodal request to OpenRouter. The model receives low-detail image hints. Actual image token use depends on the model; reducing file size does not guarantee proportional token savings.
7. The model identifies supportive, potentially higher-impact, uncertain, or irrelevant signals. Category counts are recomputed from validated per-post findings. No total carbon footprint or moral score is generated.
8. Results show coverage, compressed upload size, per-post evidence, captions, confidence, and collection warnings. Choose **Save to my private journal** to retain the textual analysis. Previously saved analyses appear on return visits with their timestamp.

Transport, food, and reuse/repair are the three supported categories. Video posts use visible cover frames only. Playback and audio are not analyzed. A caption may describe multiple carousel photos, so the model receives the caption once alongside all collected slides from that post.

The request schema requires exactly one finding for every supplied post. If a provider nevertheless omits findings, valid findings remain available as a clearly labelled partial analysis. Missing posts are marked unanalysed and excluded from category counts. Missing summary prose uses explicit project copy rather than invented model observations. Empty findings, duplicate indices, and invalid evidence still fail validation. Token-budget exhaustion has a separate error explaining the output limit. No automatic second paid request is made.

If you see an old generic "incomplete analysis" message after an update, restart the backend, reload Touch Grass in the browser extension manager, and refresh Instagram. Backend diagnostic logs include format metadata only, not captions, photos, model prose, or API keys.

## Data and privacy

- Personal records live in `storage.local`. The development preview uses `localStorage`. Demo records use a separate key.
- No analytics, automatic posting, DMs, likes, follows, or account changes.
- Collection starts only after clicking Analyze. Cancel stops further collection; an in-flight media download may finish locally.
- After model upload begins, the request may incur an OpenRouter charge even if you navigate away. The backend holds at most one active analysis and uses short job polling so a slow model response does not depend on a long-lived extension service-worker request.
- Source images are not saved to the journal or backend disk. They exist in memory during processing. Completed backend results expire from memory after ten minutes on the next request.
- OpenRouter and the selected inference provider receive compressed images and captions. Their policies still apply. The backend requests `provider.data_collection: deny`; this is not a claim of zero retention.
- The backend binds only to `127.0.0.1:8787`. It validates the Host and Origin, rejects ordinary website requests, and limits payloads to 24 MB. Keep it local.
- Export or delete records from **Settings & data**. Deletion here does not delete information already sent to OpenRouter.

## Limits and research scope

This is a working MVP with automated fixture-based tests. It has not been validated against a live logged-in Instagram account or a paid OpenRouter response. Instagram DOM changes, localization, login redirects, restricted profiles, and unsupported carousel controls may prevent complete collection. Missing content is reported instead of silently treated as evidence. Non-English carousel Next labels have a small explicit allowlist; other controls may require a selector update.

The first 10 grid posts are not necessarily the 10 most recent posts because of pins. Deleted or unavailable posts cannot be recovered. The collector uses rendered page content, not private Instagram APIs, and does not bypass access restrictions. Concurrent changes to a profile during collection can alter what is accessible.

Model observations can be wrong. A photograph does not establish ownership, consumption, travel purpose, income, or access to alternatives. Compression also removes detail. Use the evidence view to check results. This prototype does not validate lifecycle emissions, compute savings, or claim to measure an individual's actual footprint.

The prototype supports the proposal's action journal, progress reflection, profile visibility, and uncertainty exploration. A consented participant study, demographic survey, validated emissions factors, and causal analysis remain separate research work. Do not interpret sample records or model outputs as study findings.

## Development and verification

```sh
npm test             # Domain, schema, backend, and permission checks
npm run build        # Build both browser packages
npm run test:e2e     # Dashboard, collector, widget, and extension browser tests
npm run package      # Tests + build + release ZIP/XPI files and SHA256SUMS
```

Browser tests use Chrome by default. Set `PLAYWRIGHT_CHANNEL=chromium` to use Playwright Chromium. The real extension smoke test needs Playwright's Chromium-for-testing build; install it with `npx playwright install chromium`, or set `EVERGREEN_EXTENSION_BROWSER` to an existing Chromium-for-testing executable. If it is absent, that one smoke test reports a skip. Tests use synthetic Instagram pages and mocked model responses, not your account or API credits.

After editing extension code, rebuild and reload the extension in the browser's extension manager, then reload Instagram. `npm run dev` provides hot reload for the companion journal only.

```
extension/             Profile widget, DOM collector, compression, background bridge, popup
src/                   React journal, local storage, domain logic, model output contract
server/                Loopback-only OpenRouter proxy and transient analysis jobs
scripts/               Dual-browser build and packaging
tests/                 Unit/integration and browser tests
dist/firefox/          Zen/Firefox unpacked extension
dist/chromium/         Comet/Chrome unpacked extension
release/               Packaged distributions, generated by npm run package
```

Commit small, coherent batches using scoped Conventional Commits. See [AGENTS.md](AGENTS.md).

## Sources

The UI separates observed posts from verified behavior, and uses progress reflection rather than emissions rankings. Its research references are starting points for testing the proposal, not proof of effectiveness:

- [Harkin et al., 2016](https://doi.org/10.1037/bul0000025), progress monitoring and goal attainment.
- [Sparkman & Walton, 2017](https://doi.org/10.1177/0956797617719950), changing social norms and sustainable choices.
- [Schneider et al., 2017](https://doi.org/10.1371/journal.pone.0188781), anticipated pride and guilt in environmental decisions.
- [OpenRouter image inputs](https://openrouter.ai/docs/guides/overview/multimodal/image-understanding), paired text and inline image data.
- [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), supported models and JSON schemas.
