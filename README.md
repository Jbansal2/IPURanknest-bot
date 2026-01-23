
# 🤖 IPU Updates Telegram Bot

A Telegram bot that monitors GGSIPU (Guru Gobind Singh Indraprastha University) websites and sends instant notifications for new updates.


## ✨ Features

- 🎓 **Exam Results** monitoring
- 📅 **Datesheet** updates
- 📢 **Circulars/Notices** tracking
- ⚡ **Instant notifications** for every new update
- 🔄 **Automatic checks** every 5 minutes
- 📊 Bot status and statistics
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
   - Create a bot using [@BotFather](https://t.me/botfather)
   - Save your token

2. **MongoDB Database**
   - Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Copy the connection URI

3. **Vercel Account**
   - Create an account on [Vercel](https://vercel.com)


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

Create a `.env` file and add these variables:

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

Or in development mode (auto-restart):

```bash
npm run dev
```


## 🌐 Vercel Deployment (Detailed)

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

### 4. Add Environment Variables

Go to Vercel dashboard → Project Settings → Environment Variables:

- `BOT_TOKEN` - Your Telegram bot token
- `MONGODB_URI` - MongoDB connection string
- `WEBHOOK_DOMAIN` - Your Vercel app URL (e.g., `https://your-app.vercel.app`)

### 5. Webhook Setup

After deployment, set the webhook:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-app.vercel.app/api/webhook"
```


## 📱 Bot Commands

- `/start` - Subscribe to updates
- `/status` - Check bot status and last check time
- `/unsubscribe` - Stop notifications
- `/help` - Help message


## 🔧 How It Works

1. **Monitoring**: The bot checks all three websites every 5 minutes (via Vercel cron job)
2. **Change Detection**: Webpage content is hashed and stored
3. **Notification**: When the hash changes, all active users are notified
4. **Database**: User preferences and website states are stored in MongoDB


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

### Change Check Frequency

Edit the cron schedule in `vercel.json`:

```json
"crons": [
   {
      "path": "/api/check-updates",
      "schedule": "*/10 * * * *"  // 10 minutes
   }
]
```

### Add More URLs

Edit the `URLS` object in `bot.js` and `api/check-updates.js`:

```javascript
const URLS = {
      result: "http://ggsipu.ac.in/ExamResults/ExamResultsmain.htm",
      datesheet: "http://ipu.ac.in/exam_datesheet.php",
      circular: "http://ipu.ac.in/notices.php",
      admission: "http://ipu.ac.in/admissions.php"  // New URL
};
```


## 🐛 Troubleshooting

### Bot not responding?

1. Check webhook: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
2. Check Vercel logs: `vercel logs`
3. Verify environment variables

### Not receiving updates?

1. Check cron job status in Vercel dashboard
2. Manually call `/api/check-updates` to test
3. Check MongoDB connection


## 📝 Notes

- Vercel free tier has limited cron jobs (12 per day for Hobby plan)
- MongoDB Atlas free tier (512MB) is sufficient for this project
- You must activate the bot with the `/start` command


## 🤝 Contributing

Issues and pull requests are welcome!


## 📄 License

MIT


---

Made with ❤️ for IPU Students
