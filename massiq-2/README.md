# MassIQ — Body Intelligence App

A Next.js body composition tracker with AI-powered features.

## Setup

```bash
npm install
cp .env.example .env.local
# Add your Anthropic API key to .env.local
npm run dev
```

## Deploy to Vercel (recommended)

1. Push this folder to a GitHub repo
2. Import into [vercel.com](https://vercel.com)
3. Add environment variable: `ANTHROPIC_API_KEY=your_key_here`
4. Deploy — done

## Deploy to Railway / Render / Fly.io

```bash
npm run build
npm start        # runs on port 3000
```

## Environment Variables

| Variable | Required | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ Yes | — |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-4-6` |

## Features

- Body composition tracking (weight, LBM, body fat %)
- AI food analysis — text description or photo
- AI Coach chat with full context awareness
- Macro & calorie tracking with animated orbs
- Daily vitals (steps, water, sleep, HRV)
- 17-challenge progression system (Bronze → Legendary)
- 7-day history charts
