# 🤖 IPU Updates Telegram Bot

Ek Telegram bot jo GGSIPU (Guru Gobind Singh Indraprastha University) ki websites ko monitor karta hai aur naye updates par instant notifications bhejta hai.

## ✨ Features

- 🎓 **Exam Results** monitoring
- 📅 **Datesheet** updates
- 📢 **Circulars/Notices** tracking
- ⚡ **Instant notifications** jab bhi koi naya update aaye
- 🔄 **Automatic checks** har 5 minute mein
- 📊 Bot status aur statistics
- 💾 MongoDB database for user management

## 🛠️ Tech Stack

- **Node.js** - Runtime
- **Telegraf** - Telegram Bot framework
- **node-cron** - Scheduled tasks
- **MongoDB** - Database
- **Cheerio** - Web scraping
- **Axios** - HTTP requests
- **Vercel** - Serverless deployment

## 📋 Prerequisites

1. **Telegram Bot Token**
   - [@BotFather](https://t.me/botfather) se bot banao
   - Token save karo

2. **MongoDB Database**
   - [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) pe free cluster banao
   - Connection URI copy karo

3. **Vercel Account**
   - [Vercel](https://vercel.com) pe account banao

## 🌐 Vercel Deployment

### Quick Deploy

1. **Fork/Clone this repo**

2. **Install Vercel CLI**
```bash
npm install -g vercel
vercel login
```

3. **Deploy**
```bash
vercel
```

4. **Set Environment Variables** in Vercel Dashboard:
   - `BOT_TOKEN` - Your Telegram bot token
   - `MONGODB_URI` - MongoDB connection string
   - `WEBHOOK_DOMAIN` - Your Vercel app URL
   - `API_KEY` - Random secure key (generate with `openssl rand -hex 32`)

5. **Set up External Cron**
   - Sign up at https://cron-job.org (free)
   - Create job: `https://your-app.vercel.app/api/updates?key=YOUR_API_KEY`
   - Schedule: Every 1 minute

6. **Set Telegram Webhook**
```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://your-app.vercel.app/api/webhook"
```

**Full deployment guide**: See [DEPLOYMENT.md](DEPLOYMENT.md)

## 🚀 Local Development Setup

### 1. Clone/Download the project

```bash
cd ranknest-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables Setup

`.env` file banao aur ye variables add karo:

```env
BOT_TOKEN=your_telegram_bot_token
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ipu_bot
NODE_ENV=development
PORT=3000
```

### 4. Run Locally

```bash
npm start
```

Ya development mode mein (auto-restart):

```bash
npm run dev
```

## 🌐 Vercel Deployment

### 1. Install Vercel CLI

```bash
npm install -g vercel
```

### 2. Login to Vercel

```bash
vercel login
```

### 3. Deploy

```bash
vercel
```

### 4. Environment Variables Add Karo

Vercel dashboard mein jao → Project Settings → Environment Variables:

- `BOT_TOKEN` - Tumhara Telegram bot token
- `MONGODB_URI` - MongoDB connection string
- `WEBHOOK_DOMAIN` - Tumhari Vercel app URL (e.g., `https://your-app.vercel.app`)

### 5. Webhook Setup

Deployment ke baad, webhook set karo:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-app.vercel.app/api/webhook"
```

## 📱 Bot Commands

- `/start` - Subscribe to updates
- `/status` - Check bot status aur last check time
- `/unsubscribe` - Stop notifications
- `/help` - Help message

## 🔧 How It Works

1. **Monitoring**: Bot har 5 minute mein teeno websites check karta hai (Vercel cron job)
2. **Change Detection**: Webpage content ko hash karke store karta hai
3. **Notification**: Jab hash change hota hai, sabhi active users ko message bhejta hai
4. **Database**: User preferences aur website states MongoDB mein store hote hain

## 📂 Project Structure

```
ranknest-bot/
├── api/
│   ├── webhook.js          # Telegram webhook handler
│   └── check-updates.js    # Cron job for checking updates
├── bot.js                  # Main bot logic
├── vercel.json             # Vercel configuration
├── package.json            # Dependencies
├── .env.example            # Environment variables template
└── README.md               # Documentation
```

## 🔍 Monitored URLs

- **Results**: http://ggsipu.ac.in/ExamResults/ExamResultsmain.htm
- **Datesheet**: http://ipu.ac.in/exam_datesheet.php
- **Circulars**: http://ipu.ac.in/notices.php

## ⚙️ Customization

### Check Frequency Change

`vercel.json` mein cron schedule edit karo:

```json
"crons": [
  {
    "path": "/api/check-updates",
    "schedule": "*/10 * * * *"  // 10 minutes
  }
]
```

### Add More URLs

`bot.js` aur `api/check-updates.js` mein `URLS` object edit karo:

```javascript
const URLS = {
    result: "http://ggsipu.ac.in/ExamResults/ExamResultsmain.htm",
    datesheet: "http://ipu.ac.in/exam_datesheet.php",
    circular: "http://ipu.ac.in/notices.php",
    admission: "http://ipu.ac.in/admissions.php"  // New URL
};
```

## 🐛 Troubleshooting

### Bot responds nahi kar raha?

1. Check webhook: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
2. Vercel logs dekho: `vercel logs`
3. Environment variables verify karo

### Updates nahi aa rahe?

1. Check cron job status Vercel dashboard mein
2. `/api/check-updates` manually call karke test karo
3. MongoDB connection check karo

## 📝 Notes

- Vercel free tier mein cron jobs limited hain (12 per day for Hobby plan)
- MongoDB Atlas ka free tier (512MB) is project ke liye kaafi hai
- Bot ko `/start` command se activate karna padega

## 🤝 Contributing

Issues aur pull requests welcome hain!

## 📄 License

ISC

---

Made with ❤️ for IPU Students
