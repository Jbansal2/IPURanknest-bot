const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.BOT_TOKEN);
let db;
let usersCollection;
let logsCollection;
let processedUpdatesCollection;

// Register bot commands so they appear in Telegram UI
async function registerCommands() {
    try {
        await bot.telegram.setMyCommands([
            { command: 'start', description: 'Subscribe / show menu' },
            { command: 'status', description: 'Show bot status' },
            { command: 'help', description: 'Show help' },
            { command: 'unsubscribe', description: 'Unsubscribe' },
            { command: 'results', description: 'View results' },
            { command: 'datesheet', description: 'View datesheet' },
            { command: 'circular', description: 'View circulars' }
        ]);
        console.log('✅ Bot commands registered');
    } catch (e) {
        console.warn('Failed to register commands:', e.message);
    }
}

// Try to register commands on cold start
registerCommands();

// MongoDB Connection with caching
async function connectDB() {
    if (db) return db;
    
    try {
        const client = new MongoClient(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000
        });
        await client.connect();
        db = client.db('ipu_bot');
        usersCollection = db.collection('users');
        logsCollection = db.collection('logs');
        processedUpdatesCollection = db.collection('processed_updates');
        console.log('✅ MongoDB Connected (webhook)');
        return db;
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error);
        throw error;
    }
}

// Log events
async function logEvent(type, data) {
    try {
        if (!logsCollection) await connectDB();
        await logsCollection.insertOne({
            type,
            data,
            timestamp: new Date(),
            date: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        });
    } catch (error) {
        console.error('Logging error:', error);
    }
}

// URLs
const URLS = {
    result: "http://ggsipu.ac.in/ExamResults/ExamResultsmain.htm",
    datesheet: "http://ipu.ac.in/exam_datesheet.php",
    circular: "http://ipu.ac.in/notices.php"
};

// ========== BOT COMMANDS ==========

bot.start(async (ctx) => {
    try {
        await connectDB();
        
        const chatId = ctx.chat.id;
        const user = await usersCollection.findOne({ chatId });
        
        if (!user) {
            // New user
            await usersCollection.insertOne({
                chatId,
                username: ctx.from.username || 'Anonymous',
                firstName: ctx.from.first_name || 'User',
                active: true,
                subscribedAt: new Date(),
                preferences: {
                    results: true,
                    datesheet: true,
                    circular: true
                }
            });
            
            await logEvent('user_subscribed', {
                chatId,
                username: ctx.from.username,
                firstName: ctx.from.first_name,
                status: 'new_user'
            });
            
            console.log('✅ New user added:', chatId);
        } else {
            // Existing user - reactivate
            await usersCollection.updateOne(
                { chatId },
                { 
                    $set: { active: true },
                    $setOnInsert: {
                        preferences: {
                            results: true,
                            datesheet: true,
                            circular: true
                        }
                    }
                }
            );
            
            await logEvent('user_resubscribed', {
                chatId,
                username: ctx.from.username,
                status: 'returning_user'
            });
            
            console.log('✅ User reactivated:', chatId);
        }
        
        // Get current preferences
        const currentUser = await usersCollection.findOne({ chatId });
        const prefs = currentUser.preferences || { results: true, datesheet: true, circular: true };
        
        const keyboard = {
            inline_keyboard: [
                [
                    { 
                        text: `${prefs.results ? '✅' : '❌'} Exam Results`, 
                        callback_data: 'toggle_results' 
                    }
                ],
                [
                    { 
                        text: `${prefs.datesheet ? '✅' : '❌'} Datesheets`, 
                        callback_data: 'toggle_datesheet' 
                    }
                ],
                [
                    { 
                        text: `${prefs.circular ? '✅' : '❌'} Circulars/Notices`, 
                        callback_data: 'toggle_circular' 
                    }
                ]
            ]
        };
        
        const welcomeText =
            `✨ Welcome to IPU Updates Bot!\n\n` +
            `Choose which notifications you want to receive:\n\n` +
            `Tap on any option below to enable/disable:\n\n` +
            `📚 Commands:\n` +
            `/start - Show this menu\n` +
            `/status - Check your subscription status\n` +
            `/results - View exam results page\n` +
            `/datesheet - View datesheet page\n` +
            `/circular - View circulars/notices\n` +
            `/unsubscribe - Stop notifications\n` +
            `/help - Show help and commands`;

        await ctx.reply(welcomeText, { reply_markup: keyboard });
        
    } catch (error) {
        console.error('❌ Start command error:', error);
        await ctx.reply('Sorry, something went wrong. Please try /start again.');
    }
});

bot.command('unsubscribe', async (ctx) => {
    try {
        console.log('Received /unsubscribe from', ctx.from?.id, ctx.from?.username, 'chat', ctx.chat?.id);
        await connectDB();
        
        await usersCollection.updateOne(
            { chatId: ctx.chat.id },
            { $set: { active: false } }
        );
        
        await logEvent('user_unsubscribed', {
            chatId: ctx.chat.id,
            username: ctx.from.username
        });
        
        ctx.reply('❌ You have been unsubscribed. Use /start to subscribe again.');
    } catch (error) {
        console.error('Unsubscribe error:', error);
        ctx.reply('Error processing your request.');
    }
});

bot.command('status', async (ctx) => {
    try {
        console.log('Received /status from', ctx.from?.id, ctx.from?.username, 'chat', ctx.chat?.id);
        await connectDB();
        
        const totalUsers = await usersCollection.countDocuments({ active: true });
        const user = await usersCollection.findOne({ chatId: ctx.chat.id });
        
        let message = `📊 <b>Bot Status</b>\n━━━━━━━━━━━━━━━\n\n`;
        message += `👥 Active Users: ${totalUsers}\n`;
        message += `✅ Your Status: ${user?.active ? 'Subscribed' : 'Not Subscribed'}\n\n`;
        message += `🔗 Monitoring:\n`;
        message += `• 🎓 Exam Results\n`;
        message += `• 📅 Datesheets\n`;
        message += `• 📢 Circulars\n\n`;
        message += `⏰ <i>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>`;
        
        ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
        console.error('Status error:', error);
        ctx.reply('Error fetching status.');
    }
});

bot.command('help', async (ctx) => {
    console.log('Received /help from', ctx.from?.id, ctx.from?.username, 'chat', ctx.chat?.id);
    const message = `
🤖 <b>IPU Updates Bot - Help</b>
━━━━━━━━━━━━━━━

<b>Available Commands:</b>

/start - Subscribe to updates
/status - Check bot status
/results - View results page
/datesheet - View datesheet page
/circular - View circulars page
/unsubscribe - Stop notifications
/help - Show this message

<b>Features:</b>
• Instant notifications for new updates
• Customize notification preferences
• Monitor multiple IPU websites

For support, contact: @YourUsername
`;
    
    ctx.reply(message, { parse_mode: 'HTML' });
});

bot.command('results', async (ctx) => {
    console.log('Received /results from', ctx.from?.id, ctx.from?.username, 'chat', ctx.chat?.id);
    const message = `<b>🎓 Exam Results</b>\n━━━━━━━━━━━━━━━\n\n🔗 <a href="${URLS.result}">View All Results</a>`;
    ctx.reply(message, { parse_mode: 'HTML' });
});

bot.command('datesheet', async (ctx) => {
    console.log('Received /datesheet from', ctx.from?.id, ctx.from?.username, 'chat', ctx.chat?.id);
    const message = `<b>📅 Datesheets</b>\n━━━━━━━━━━━━━━━\n\n🔗 <a href="${URLS.datesheet}">View All Datesheets</a>`;
    ctx.reply(message, { parse_mode: 'HTML' });
});

bot.command('circular', async (ctx) => {
    console.log('Received /circular from', ctx.from?.id, ctx.from?.username, 'chat', ctx.chat?.id);
    const message = `<b>📢 Circulars/Notices</b>\n━━━━━━━━━━━━━━━\n\n🔗 <a href="${URLS.circular}">View All Circulars</a>`;
    ctx.reply(message, { parse_mode: 'HTML' });
});

// Generic logger for incoming messages to help debug command routing
bot.on('message', (ctx) => {
    try {
        console.log('Incoming message:', {
            from: ctx.from && { id: ctx.from.id, username: ctx.from.username },
            chatId: ctx.chat && ctx.chat.id,
            text: ctx.message && ctx.message.text,
            updateType: ctx.updateType
        });
    } catch (e) {
        console.error('Message logger error:', e.message);
    }
});

// Handle callback queries for toggle buttons
bot.action(/toggle_(.+)/, async (ctx) => {
    try {
        await connectDB();
        
        const type = ctx.match[1]; // results, datesheet, or circular
        const chatId = ctx.chat.id;
        
        const user = await usersCollection.findOne({ chatId });
        const currentPrefs = user.preferences || { results: true, datesheet: true, circular: true };
        
        // Toggle preference
        currentPrefs[type] = !currentPrefs[type];
        
        await usersCollection.updateOne(
            { chatId },
            { $set: { preferences: currentPrefs } }
        );
        
        await logEvent('preference_changed', {
            chatId,
            username: ctx.from.username,
            type,
            newValue: currentPrefs[type]
        });
        
        // Update keyboard
        const keyboard = {
            inline_keyboard: [
                [
                    { 
                        text: `${currentPrefs.results ? '✅' : '❌'} Exam Results`, 
                        callback_data: 'toggle_results' 
                    }
                ],
                [
                    { 
                        text: `${currentPrefs.datesheet ? '✅' : '❌'} Datesheets`, 
                        callback_data: 'toggle_datesheet' 
                    }
                ],
                [
                    { 
                        text: `${currentPrefs.circular ? '✅' : '❌'} Circulars/Notices`, 
                        callback_data: 'toggle_circular' 
                    }
                ]
            ]
        };
        
        const enabledTypes = [];
        if (currentPrefs.results) enabledTypes.push('🎓 Results');
        if (currentPrefs.datesheet) enabledTypes.push('📅 Datesheets');
        if (currentPrefs.circular) enabledTypes.push('📢 Circulars');
        
        const statusText = enabledTypes.length > 0 
            ? `\n\n✅ You'll receive: ${enabledTypes.join(', ')}`
            : `\n\n⚠️ No notifications enabled!`;
        
        await ctx.editMessageText(
            `✨ Welcome to IPU Updates Bot!\n\n` +
            `Choose which notifications you want to receive:\n\n` +
            `Tap on any option below to enable/disable:` +
            statusText,
            { reply_markup: keyboard }
        );
        
        await ctx.answerCbQuery('✅ Updated!');
    } catch (error) {
        console.error('Toggle error:', error);
        await ctx.answerCbQuery('Error updating preferences');
    }
});

// Error handling
bot.catch(async (err, ctx) => {
    console.error('Bot Error:', err);
    
    try {
        await logEvent('bot_error', {
            error: err.message,
            userId: ctx?.from?.id
        });
    } catch (logError) {
        console.error('Error logging failed:', logError);
    }
});

// ========== VERCEL SERVERLESS HANDLER ==========

module.exports = async (req, res) => {
    try {
        // Ensure DB connection
        await connectDB();
        // Idempotency: check already-processed Telegram update_id
        const updateId = req.body && (req.body.update_id || req.body.update?.update_id);
        if (updateId) {
            const seen = await processedUpdatesCollection.findOne({ update_id: updateId });
            if (seen) return res.status(200).json({ ok: true, skipped: true });
        }
        
        if (req.method === 'POST') {
            // Handle incoming Telegram updates
            await bot.handleUpdate(req.body);
            // mark update as processed (best-effort)
            if (updateId) {
                try { await processedUpdatesCollection.insertOne({ update_id: updateId, receivedAt: new Date() }); } catch (e) {}
            }
            return res.status(200).json({ ok: true });
        } else if (req.method === 'GET') {
            // Health check
            return res.status(200).json({ 
                status: 'Bot is running',
                timestamp: new Date().toISOString()
            });
        } else {
            return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('❌ Webhook error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
};