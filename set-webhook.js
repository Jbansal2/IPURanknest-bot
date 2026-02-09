const { Telegraf } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

async function setWebhook() {
    try {
        const webhookUrl = `${process.env.WEBHOOK_DOMAIN}/api/webhook`;
        await bot.telegram.setWebhook(webhookUrl);
        console.log(`✅ Webhook set to: ${webhookUrl}`);
        
        // Verify
        const info = await bot.telegram.getWebhookInfo();
        console.log('Webhook info:', info);
    } catch (error) {
        console.error('❌ Error setting webhook:', error);
    }
}

setWebhook();