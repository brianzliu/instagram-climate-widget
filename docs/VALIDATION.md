# MVP validation

## Touch Grass 0.4

The browser suite covers private photo attachments, completing a private change plan, and receiving credit in Climate Wrapped. A hosted test runs the built web app against a local community server and uses two independent browser sessions to publish a photo, like an action, and leave a comment. Integration tests check that retries do not duplicate reactions or comments, and that participants can remove only their own content or comments on their own posts.

The community board uses the existing hosted service and persistent storage. The release has no public deployment.

## Touch Grass 0.3

Validated November 19, 2026.

- 20 unit and integration tests passed. They cover post revisions, the photo budget, partial model responses, public sharing with profile-scoped credentials, storage across service restarts, removal, and journal dates.
- 15 browser tests passed, including the installed Chromium extension. Fixture tests cover scan checkmarks, revised captions, cached profile summaries, explicit photo selection, the separate community gallery, action review, and recap availability.
- The desktop and mobile journal and recap layouts were inspected. Both extension targets built and were packaged.
- Live Instagram, paid model calls, and a public community deployment remain unverified for this version. A caption-only edit that isn't visible on the profile grid can require opening the post or running **Scan for changes**. The gallery requires an HTTPS deployment with a persistent disk and provisioned profile credentials.

The sections below describe earlier versions.

## Touch Grass 0.2 update

Validated November 17, 2026. The extension, dashboard, popup, icons, recap exports, and distribution filenames now use Touch Grass. Legacy storage keys and the original Firefox add-on ID remain unchanged to preserve existing journals.

- 18 unit/integration tests passed, including the hard 20-photo budget, journal date handling, and deduplication.
- 12 browser tests passed, including the actual Chromium extension, automatic journal saving, caption/date evidence, demo isolation, and both desktop and mobile layouts.
- The dashboard removes the large welcome banner and repeated copy. The profile widget keeps headline counts visible and expands evidence on demand. A small grass character and a lime accent provide the playful styling.
- Desktop, mobile, and widget screenshots were visually inspected. No live Instagram content or paid model requests were used for this design update.
- Both Firefox/Zen and Chromium/Comet packages were rebuilt. Permanent Firefox installation still requires Mozilla signing.

The records below describe earlier MVP checks.

Validated on November 10, 2026.

## Passing checks

- `npm run package`: 10 unit/integration tests passed, both browser builds succeeded, ZIP/XPI packages and SHA-256 checksums generated.
- Playwright browser suite: 8 tests passed, including the real Chromium extension test with an explicitly selected Chromium-for-testing executable. No skips in the final run.
- Zen: the Firefox build installed successfully as a temporary add-on in a separate headless Zen profile using Mozilla's `web-ext`. That test profile was closed afterward.
- Mozilla `web-ext lint`: zero errors, zero notices, four warnings. One warning concerns Android support for data-collection metadata at the declared minimum Gecko version. This MVP targets desktop Zen/Firefox. The other three flag dynamic `innerHTML` assignments in the escaped widget template and bundled React. All post/model strings inserted by the widget pass through HTML escaping. Store review and signing remain separate work.
- Desktop and mobile journal screenshots were inspected. The small-screen test checks horizontal overflow and keyboard dismissal of the log-action dialog.
- `git diff --check`: passed.

## What the tests exercise

- Valid action dates, leap years, month/week boundaries, category counts, and demo isolation.
- Bounded inline-image requests, caption pairing, model output validation, and counts derived from per-post findings.
- Local backend Origin/Host restrictions, missing-key errors, single-request concurrency, asynchronous job polling, and keeping keys out of health responses.
- First-10-post collection from synthetic Instagram-shaped pages, caption extraction, carousel advancement, image compression, evidence display, profile navigation, and missing-configuration errors.
- Persistent action logging in both a regular browser preview and real extension storage.
- Timeline search, date controls, period charts, recap download, journal navigation, and mobile layout.
- The packaged Chromium extension's popup, background worker, dashboard, and local backend connection under its content security policy.

## Validation still needed

No live Instagram account was accessed, and no paid OpenRouter request was made. The collector was tested against controlled fixtures, not Instagram's current logged-in DOM. Run the following checks in your normal browser after configuring the API key:

1. Load the correct unpacked package and allow its Instagram/CDN site access.
2. Open a consenting participant's accessible profile and confirm the widget anchors beside the profile photo.
3. Analyze a profile with at least ten posts, including a carousel, then compare every reported caption and photo count to the original posts.
4. Verify the actual selected OpenRouter model accepts the images and structured schema. Review its output against the original posts.
5. Test a private/unavailable profile, a video post, and a non-English carousel. Confirm missing access remains visible as a collection warning.
6. Save the result, revisit the profile, and verify the cached timestamp and private journal entry.

These checks establish product behavior. They do not establish model accuracy, environmental impact, or a causal change in participant motivation.

## Model-response handling update

The generic incomplete-analysis error was investigated using the configured `deepseek/deepseek-v4.1-flash-1017` model. Its OpenRouter listing reported image-input and structured-output support. Two synthetic probes, with two posts and ten posts, both returned complete, valid findings. These probes used an app-icon illustration and invented captions, with no Instagram content. The precise real-profile response that triggered the screenshot was not retained and could not be reconstructed.

The request now constrains the schema to the exact supplied post count. The parser retains valid partial findings, explicitly marks missing indices as unanalysed, derives category counts from returned findings only, and supplies clearly identified project text for missing summary prose. Truncated responses report the output-token budget. Empty or invalid evidence remains an error. Regression tests cover these cases, including the widget's partial-coverage display. The backend was restarted with its existing model configuration.
