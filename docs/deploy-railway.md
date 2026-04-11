# Deploy on Railway

Railway is the easiest way to host your own Storybook. No terminal or coding experience needed.

## What You'll Need

- A **Railway account** — [Sign up here](https://railway.app) (free to start, ~$5/month for the Hobby plan)
- An **OpenRouter API key** — [Get one here](getting-openrouter-key.md) (takes 2 minutes)

## Step 1: Deploy

Click this button:

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.app/template/storybook)

This creates your own Storybook server with:
- A web service running the app
- A persistent volume for your stories and photos

## Step 2: Wait for Build

Railway will build and deploy your app automatically. This takes about 2-3 minutes the first time.

You'll see a green "Success" status when it's ready.

## Step 3: Open Your App

1. Click on your service in the Railway dashboard
2. Go to the **"Settings"** tab
3. Under **"Networking"**, click **"Generate Domain"** to get a public URL
4. Click the URL to open your Storybook

## Step 4: Set Up Your Storybook

The first time you open the app, a setup wizard will guide you through:

1. **Choose a password** — This protects your family's photos and stories
2. **Add your API key** — Paste the OpenRouter key you created earlier
3. **You're done!** — Start adding characters and creating stories

## Costs

| Component | Monthly Cost |
|-----------|-------------|
| Railway Hobby plan | ~$5 (often covered by trial credits) |
| OpenRouter AI usage | ~$1-5 (depends on how many stories) |
| **Total** | **~$6-10/month** |

Railway's Hobby plan includes $5 in monthly credits, which is usually enough to run Storybook.

## Custom Domain (Optional)

If you want a custom domain like `stories.yourdomain.com`:

1. In Railway, go to your service → **Settings** → **Networking**
2. Click **"Add Custom Domain"**
3. Enter your domain name
4. Add the CNAME record to your DNS provider (Railway shows you what to add)

## Updating

Railway automatically rebuilds your app when you... well, you don't need to do anything! If you deployed from the template, you're all set. Updates are manual — you can redeploy from the Railway dashboard when new versions are available.

## Troubleshooting

**App shows an error page** — Check the Railway dashboard for deployment logs. The most common issue is the build timing out on the first try — just click "Redeploy."

**"Insufficient credits" warning in the app** — Add more credits to your OpenRouter account.

**Can't access the app** — Make sure you generated a domain in Railway settings (Step 3 above).
