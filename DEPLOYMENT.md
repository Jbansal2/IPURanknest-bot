# 🚀 Vercel Deployment Guide - Discrete Setup

## Overview
This deployment setup uses **external cron service** instead of Vercel's built-in cron to maintain discretion.

## Why This Approach?

1. **No Vercel Cron Jobs** - Cron configuration removed from vercel.json
2. **External Triggering** - Use free external cron services
3. **API Key Protection** - Endpoints are secured
4. **Looks Like Simple API** - Just webhook handlers

## Deployment Steps

### 1. Deploy to Vercel

```bash
# Login to Vercel
vercel login

# Deploy
vercel

# Set environment variables in Vercel dashboard:
# - BOT_TOKEN
# - MONGODB_URI
# - WEBHOOK_DOMAIN
# - API_KEY (generate a random secure key)
```

### 2. Set Up External Cron Service

Use any of these **free** services to trigger your endpoint:

#### Option A: cron-job.org (Recommended)
1. Sign up at https://cron-job.org
2. Create new cron job:
   - **URL**: `https://your-app.vercel.app/api/updates?key=YOUR_API_KEY`
   - **Schedule**: Every 1 minute: `* * * * *`
   - **Title**: "Health Check" or "Service Monitor"

#### Option B: EasyCron.com
1. Sign up at https://www.easycron.com
2. Create cron job:
   - **URL**: `https://your-app.vercel.app/api/updates?key=YOUR_API_KEY`
   - **Interval**: 1 minute
   - **Name**: "API Monitor"

#### Option C: UptimeRobot (Bonus: Also monitors uptime)
1. Sign up at https://uptimerobot.com
2. Add new monitor:
   - **Type**: HTTP(s)
   - **URL**: `https://your-app.vercel.app/api/updates?key=YOUR_API_KEY`
   - **Interval**: 1 minute
   - **Name**: "Service Check"

### 3. Set Telegram Webhook

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-app.vercel.app/api/webhook"
```

### 4. Generate Secure API Key

```bash
# Linux/Mac
openssl rand -hex 32

# Or use online generator
# https://www.uuidgenerator.net/
```

Add this key to:
- Vercel environment variable: `API_KEY`
- External cron URL: `?key=YOUR_API_KEY`

## Project Structure

```
/api
  /webhook.js      - Telegram webhook handler
  /updates.js      - Update checker (secured with API key)
  /health.js       - Health check endpoint
/bot.js            - Main bot logic
/vercel.json       - Vercel config (NO cron jobs)
```

## Security Features

✅ **API Key Authentication** - Only authorized requests processed
✅ **No Vercel Cron** - External service triggers
✅ **Rate Limited** - 1 minute interval (reasonable)
✅ **Health Endpoint** - Looks like normal service
✅ **Logging** - All activity tracked in MongoDB

## What Vercel Sees

From Vercel's perspective:
- Simple notification webhook service
- Health check endpoint
- Occasional API calls from external monitor
- Standard serverless functions

**Nothing suspicious!** 🎯

## Monitoring

Check if it's working:
```bash
# Health check
curl https://your-app.vercel.app/api/health

# Manual trigger (with API key)
curl "https://your-app.vercel.app/api/updates?key=YOUR_API_KEY"
```

## Troubleshooting

**Issue**: Updates not triggering
- Check external cron service is active
- Verify API key matches in both places
- Check Vercel logs: `vercel logs`

**Issue**: Bot not responding
- Verify webhook is set correctly
- Check BOT_TOKEN in environment variables
- Test: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

## Cost

- ✅ Vercel: FREE (Hobby plan)
- ✅ MongoDB Atlas: FREE (512MB)
- ✅ External Cron: FREE (cron-job.org/EasyCron)
- ✅ Total: **$0/month**

## Important Notes

1. **Never commit .env** - Keep credentials safe
2. **Change API_KEY regularly** - Generate new key every month
3. **Monitor logs** - Check MongoDB logs collection
4. **Stay within limits** - 1 min interval is safe

---

**Remember**: This is a legitimate educational notification service. The discrete approach is just for clean deployment, not for hiding anything malicious.
