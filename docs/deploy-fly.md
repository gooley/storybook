# Deploy on Fly.io

Fly.io is a great option if you're comfortable with the command line. It's the cheapest way to run Storybook (~$2.40/month) and supports scale-to-zero (no charges when you're not using it).

## Prerequisites

- A [Fly.io](https://fly.io) account
- The [Fly CLI](https://fly.io/docs/flyctl/install/) installed on your computer
- An [OpenRouter API key](getting-openrouter-key.md)

## Step 1: Install Fly CLI

```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh

# Windows
powershell -Command "irm https://fly.io/install.ps1 | iex"
```

## Step 2: Log In

```bash
fly auth login
```

## Step 3: Clone the Repository

```bash
git clone https://github.com/gooley/storybook.git
cd storybook
```

## Step 4: Launch the App

```bash
fly launch --no-deploy
```

When prompted:
- **App name**: Choose something memorable (e.g., `my-family-storybook`)
- **Region**: Pick the one closest to you
- **Database**: No (we use SQLite)

## Step 5: Create a Volume

```bash
fly volumes create storybook_data --size 1 --region <your-region>
```

Replace `<your-region>` with the region you chose in Step 4 (e.g., `sea` for Seattle, `iad` for Virginia).

## Step 6: Configure

Edit the generated `fly.toml` to add the volume mount:

```toml
[mounts]
  source = "storybook_data"
  destination = "/app/data"

[env]
  DATA_DIR = "/app/data"
```

## Step 7: Deploy

```bash
fly deploy
```

This builds and deploys your app. It takes about 3-5 minutes the first time.

## Step 8: Open Your App

```bash
fly open
```

The setup wizard will guide you through setting your password and API key.

## Costs

Fly.io pricing with scale-to-zero:

| Resource | Cost |
|----------|------|
| Shared CPU (when running) | ~$1.94/month |
| 256MB RAM (when running) | ~$0.46/month |
| 1GB Volume | ~$0.15/month |
| **Total (with scale-to-zero)** | **~$2-3/month** |

With scale-to-zero, you only pay for compute when someone is actively using the app. The volume charge is constant.

## Updating

To update to the latest version:

```bash
cd storybook
git pull
fly deploy
```

## Troubleshooting

**"No machines running"** — Your app scaled to zero. It will start automatically when you visit the URL (may take 10-20 seconds on first request).

**"Volume not found"** — Make sure the volume region matches your app region. Run `fly volumes list` to check.

**Build fails** — Try `fly deploy --remote-only` to build on Fly's servers instead of locally.
