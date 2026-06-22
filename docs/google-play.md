# Google Play Release Checklist

This project is best published to Google Play as a Trusted Web Activity (TWA) generated with Bubblewrap.

## 1. Prerequisites

- Live HTTPS site: `https://agentmode.dev/`
- Live manifest: `https://agentmode.dev/manifest.webmanifest`
- Privacy policy URL: `https://agentmode.dev/privacy.html`
- Android package name selected before first upload, for example `dev.agentmode.aihorizon`
- Release signing key available and backed up

## 2. Generate the Android wrapper

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest=https://agentmode.dev/manifest.webmanifest
```

Recommended values during `bubblewrap init`:

- Start URL: `https://agentmode.dev/`
- Application ID: your permanent package name
- Launcher name: `AI HORIZON`
- Display mode: `standalone`
- Status bar color / theme color: `#000000`

Build and test locally:

```bash
bubblewrap build
bubblewrap install
```

Generate the Play upload bundle from the Android project:

```bash
./gradlew bundleRelease
```

## 3. Digital Asset Links

The site must publish `/.well-known/assetlinks.json` with the Android package name and the correct SHA-256 certificate fingerprint.

Template:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "dev.agentmode.aihorizon",
      "sha256_cert_fingerprints": ["REPLACE_WITH_RELEASE_CERT_SHA256"]
    }
  }
]
```

Notes:

- For local sideload testing, the fingerprint must match the certificate used to sign that test build.
- For the Play-distributed app, the fingerprint must match the Play app signing certificate if Play App Signing is enabled.
- If TWA verification fails, the app opens as a Custom Tab with a browser bar instead of fullscreen.

## 4. Play Console declarations

Prepare these before submitting:

- App name, short description, and full description
- Privacy policy URL
- Data safety form
- Target audience declaration
- Content rating questionnaire
- Ads declaration
- Contact email and store listing details
- Screenshots and feature graphic

## 5. Data surface in this repo

The current app is not a zero-data app.

Remote leaderboard flow stores or transmits:

- 3-letter initials
- score
- accuracy
- date
- optional `game-summary`
- optional `ai-analysis`

Remote AI debrief flow sends a run summary that currently includes:

- gameplay metrics and score breakdown
- timestamp
- user agent
- viewport width and height
- locale
- time zone
- platform

Relevant source files:

- `js/managers/LeaderboardManager.js`
- `js/adapters/Cognito.js`
- `js/adapters/AIAnalysisAdapter.js`
- `js/game.js`
- `server/lambda/leaderboard.js`
- `server/lambda/analysis.js`

## 6. Suggested submission order

1. Host `privacy.html`
2. Generate the Android wrapper
3. Create signing key and build a release bundle
4. Publish `/.well-known/assetlinks.json`
5. Verify fullscreen TWA behavior on device
6. Complete Play Console declarations and upload the bundle
