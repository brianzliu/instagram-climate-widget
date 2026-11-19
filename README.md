# Touch Grass

Touch Grass spots climate-friendly actions in Instagram posts, gives them a little encouragement, and lets you keep the actions you confirm in a private journal. The extension handles scanning. A separate web app includes the journal, Climate Wrapped, and a community gallery for photos people choose to share.

## Install the extension

Use Node.js 22.9 or newer.

```sh
npm install
cp .env.example .env
npm run build
```

For new scans, set `OPENROUTER_API_KEY` and your image-capable model in `.env`. Run `npm run api` and keep it running while you scan. The key stays in the loopback backend.

- **Zen and Firefox.** Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/firefox/manifest.json`. Enable the extension's Instagram access if prompted. Load it again after a browser restart. The release XPI is unsigned.
- **Comet and Chromium.** Open `chrome://extensions`, enable developer mode, and load the entire `dist/chromium` folder as an unpacked extension.

Version 0.3 retains the original Firefox add-on ID and storage keys. Reload the same installed extension to keep your journal.

## Scan, review, recap

1. Open an Instagram profile. Click **Scan up to 10 posts** beside the profile photo. Touch Grass checks up to 10 accessible grid posts, including pins, with a limit of two photos per post and 20 per scan. The scan sends new or edited posts' compressed photos and captions to OpenRouter.
2. Look for checkmarks on scanned tiles. A visible grid change clears the checkmark. Opening a previously scanned post can also reveal an edited caption. **Scan for changes** compares the readable caption and media identifiers before reusing the old finding. Unchanged posts with a readable revision can skip image downloads and inference.
3. Open **My journal → Instagram observations**. Review the caption and evidence. If the post depicts an action you took, use **Review for my journal**, edit the action as needed, and confirm the date. Those actions join anything you log directly. Scanning another person's posts does not add to your personal recap.
4. Open **Climate Wrapped** and choose **Day**, **Week**, or **Month**. Each selection opens the most recently completed period in your local time. Weeks start Monday. A recap appears after the period closes if it contains at least one logged action. You can revisit past recaps and save them as images. Recaps count recorded actions, with no emissions estimate.

Use `npm run dev` for the web app on `http://127.0.0.1:5173`. The browser version opens a clearly labelled fictional demo. Use **Start my journal** for an empty personal journal. The extension and the website have separate private storage. To bring actions from the extension to the website, export your personal journal JSON in **Settings & data** and use **Import personal actions** on the site. Import restores actions, including actions you confirmed from Instagram. Scan evidence remains in the original journal.

## Host the community site

The community server serves the web app and its public gallery API. Run a single Node process with a persistent cloud disk mounted at `TOUCH_GRASS_DATA_DIR`, behind an HTTPS reverse proxy. The data is stored on that disk across restarts. The community process needs no OpenRouter credentials.

1. Run `npm ci` and `npm run build` on the host, or deploy the repository with the built `dist/app` directory.
2. Configure the community process with `TOUCH_GRASS_DATA_DIR` and `TOUCH_GRASS_PUBLISHERS`. The latter is a JSON object mapping each lowercase Instagram handle to a unique, random credential of at least 32 characters. Give credentials only to confirmed profile owners. Configure `PORT` and `TOUCH_GRASS_BIND` to match the deployment.
3. Start it with `npm run community`. Share the resulting HTTPS URL with `/#community` to open the gallery directly.
4. On each installation with the local analysis backend, set `TOUCH_GRASS_COMMUNITY_URL` to the site's HTTPS origin. To let that person publish, also set the provisioned `TOUCH_GRASS_SHARE_PROFILE` and `TOUCH_GRASS_SHARE_TOKEN`. Restart `npm run api`. Readers need no personal credential.

A provisioned publisher can scan their own profile and choose **Review & share photos**. Select each post to share, check the displayed photos, and edit the action description before publishing. Shared photos, action descriptions, dates where available, and original post links are public. Captions, private notes, and unselected photos are excluded. The gallery retains up to 20 recently shared posts per profile. **Settings & data → Test connection → Remove shared posts** removes the shared profile and photos from the server. Copies previously saved by visitors may still exist.

Installed extensions show a summary of shared actions on the profile's Touch Grass button on hover or keyboard focus. The summary reflects the last publication. Scanning checks the source revision before using an owner-reviewed result in place of a new model request. Viewers can browse the public gallery directly without installing the extension, logging in to Instagram, or running a model scan.

## Privacy and limits

- Your journal and scan evidence stay in the browser. A scan sends only the new or changed items selected by the workflow to the configured OpenRouter model. The backend requests providers with data collection disabled. Provider terms still apply. Publishing to the gallery is a separate, explicit export.
- Instagram does not expose an authoritative edit version on every grid tile. A caption-only change can leave a last-scan checkmark in place until the caption is visible or you scan for changes. Captions unavailable from a post heading and unreadable media limit cache reuse. Community posts remain as last published until the owner updates or removes them.
- The scan uses rendered Instagram pages and does not bypass access restrictions. Instagram layout changes, language settings, pins, and private profiles can affect coverage. Videos contribute cover frames only.
- Model suggestions need human review. They describe what appears in a limited sample and do not establish a person's behavior, values, or footprint.
- Recaps are available in the app when you open it. This version does not send notifications or sync private journals.

## Verify and package

```sh
npm run package    # Unit/integration tests, both builds, ZIP/XPI and checksums
npm run test:e2e   # Browser tests with synthetic profiles and mocked model responses
```

To include the extension smoke test, use a Playwright Chromium-for-testing executable with `EVERGREEN_EXTENSION_BROWSER` or install Chromium for the current Playwright version. See [validation notes](docs/VALIDATION.md) for the live checks still needed.
