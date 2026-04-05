# Storybook

A personalized children's storybook generator. Uses AI to create illustrated stories featuring your family and friends. Designed for a 6" color e-ink tablet, with a web companion for managing characters and browsing stories.

## Architecture

```
├── android/     # Kotlin/Compose Android app (local-first, syncs to server)
├── server/      # Node.js/Express API (SQLite, image storage)
└── web/         # React SPA (character management, story browser)
```

Deployed on gool3yhost at `storybook.gool3y.com`.

## Android App

See [android/README.md](android/README.md) for build/install instructions.

```bash
cd android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew assembleDebug
```

## Server + Web

```bash
cd server && npm install && npm run dev    # API on :3000
cd web && npm install && npm run dev       # Dev server on :5173
```

## Deploy

```bash
gool3yhost app deploy
```
