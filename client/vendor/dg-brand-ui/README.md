# @deepgram-devs/dg-brand-ui (vendored)

Deepgram's UI kit for voice agent apps: the brand theme, the landing and call screens, the session panel, and the voice ring. The client installs it from this folder (`"file:vendor/dg-brand-ui"` in `client/package.json`), so `npm install` needs nothing outside this repository.

This is version 0.6.1 (commit `d368104`), trimmed to what an app needs at runtime: `src/`, `assets/`, `tokens/`, `catalog.json`, and the `vdui-assets` script, which copies `assets/` into `client/public/vdui/` on install. The kit's docs, Storybook stories, tests, and agent skills aren't included.

`client/.npmrc` sets `install-links=true`, so npm copies this folder into `node_modules` rather than linking to it. After you change anything here, run `npm install` in `client/` again to pick it up.

The kit is MIT licensed in this repository; see `LICENSE`.
