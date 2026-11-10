# MVP validation

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
