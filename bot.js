const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const cron = require('node-cron');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const express = require("express");
const app = express();
// Parse JSON bodies for incoming webhook requests
app.use(express.json());

// Environment-backed server/webhook configuration
const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.WEBHOOK_DOMAIN || process.env.DOMAIN || `http://localhost:${PORT}`;
const webhookPath = process.env.WEBHOOK_PATH || '/api/webhook';

// Use test bot token for development (with fallback to production token)
const TEST_BOT_TOKEN = process.env.TEST_BOT_TOKEN;
const PRODUCTION_BOT_TOKEN = process.env.BOT_TOKEN;

let BOT_TOKEN;
let isTestBot = false;

if (process.env.NODE_ENV === 'production') {
    BOT_TOKEN = PRODUCTION_BOT_TOKEN;
    console.log('🚀 Using PRODUCTION bot token');
} else {
    // Check if test token is properly set (not placeholder)
    if (TEST_BOT_TOKEN && 
        TEST_BOT_TOKEN !== 'YOUR_TEST_BOT_TOKEN_HERE' && 
        TEST_BOT_TOKEN !== 'PUT_YOUR_NEW_TEST_BOT_TOKEN_HERE' && 
        TEST_BOT_TOKEN.includes(':') && 
        TEST_BOT_TOKEN.length > 20) {
        BOT_TOKEN = TEST_BOT_TOKEN;
        isTestBot = true;
        console.log('🧪 Using TEST bot token');
    } else {
        BOT_TOKEN = PRODUCTION_BOT_TOKEN;
        console.log('⚠️  TEST_BOT_TOKEN not properly set - Using PRODUCTION bot token for local development');
        console.log('💡 Tip: Create a test bot with @BotFather and set TEST_BOT_TOKEN in .env');
    }
}

const bot = new Telegraf(BOT_TOKEN);
let db;
let usersCollection;
let updatesCollection;
let logsCollection;

// Health check endpoint (always available)
app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'active',
        service: 'ipu-ranknest-bot',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Basic home route
app.get("/", (req, res) => {
    res.send("IPU Bot Webhook Running 🚀");
});

// Updates endpoint (available immediately) 
app.all('/api/updates', async (req, res) => {
    try {
        const key = req.query.key || req.headers['x-api-key'] || req.headers['x-key'];
        if (!key || (key !== process.env.API_KEY && key !== 'internal-cron-trigger')) {
            return res.status(401).json({ ok: false, error: 'Unauthorized - Please provide valid API key' });
        }

        console.log('🔄 Manual update check triggered via API...');

        // Check if DB is connected
        if (!db) {
            console.log('DB not connected, connecting...');
            await connectDB();
        }

        // Optionally run in background to respond quickly
        const runInBackground = req.query.background === 'true' || req.headers['x-background'] === 'true';

        if (runInBackground) {
            res.status(200).json({ ok: true, background: true, timestamp: new Date().toISOString() });
            setTimeout(() => { checkForUpdates().catch(e => console.error('Background check error:', e)); }, 10);
            return;
        }

        await checkForUpdates();
        return res.status(200).json({ ok: true, message: 'Updates checked successfully', checkedAt: new Date().toISOString() });
    } catch (error) {
        console.error('Updates endpoint error:', error);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// Webhook endpoint for Telegram 
app.post(webhookPath, async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        return res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook handling error:', error);
        return res.status(500).send('Internal Server Error');
    }
});

// MongoDB Connection
async function connectDB() {
    try {
        const client = new MongoClient(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000
        });
        await client.connect();
        db = client.db('ipu_bot');
        usersCollection = db.collection('users');
        updatesCollection = db.collection('updates');
        logsCollection = db.collection('logs');
        console.log('✅ MongoDB Connected');
    } catch (error) {
        console.error('MongoDB Connection Error:', error);
    }
}

// Log events to database
async function logEvent(type, data) {
    try {
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

// URLs to monitor
const URLS = {
    result: "http://ggsipu.ac.in/ExamResults/ExamResultsmain.htm",
    datesheet: "http://ipu.ac.in/exam_datesheet.php",
    circular: "http://ipu.ac.in/notices.php"
};

// Fetch and hash webpage content
async function getPageHash(url, type, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await axios.get(url, {
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                },
                validateStatus: function (status) {
                    return status < 500; // Accept any status < 500
                }
            });
            
            const $ = cheerio.load(response.data);
            
            let titles = [];
            if (type === 'result') {
                // Extract only top 10 link titles (normalized)
                $('table tr').each((i, row) => {
                    if (titles.length >= 10) return false;
                    const text = $(row).find('a').first().text().trim().replace(/\s+/g, ' ');
                    if (text && text.length > 10 && !text.toLowerCase().includes('s.no') && !text.toLowerCase().includes('title')) {
                        titles.push(text);
                    }
                });
            } else if (type === 'datesheet') {
                $('table tr').each((i, row) => {
                    if (titles.length >= 10) return false;
                    const text = $(row).find('a').first().text().trim().replace(/\s+/g, ' ');
                    if (text && text.length > 10 && !text.toLowerCase().includes('s.no') && !text.toLowerCase().includes('title')) {
                        titles.push(text);
                    }
                });
            } else if (type === 'circular') {
                $('table tr').each((i, row) => {
                    if (titles.length >= 10) return false;
                    const text = $(row).find('a').first().text().trim().replace(/\s+/g, ' ');
                    if (text && text.length > 10 && !text.toLowerCase().includes('s.no') && !text.toLowerCase().includes('title')) {
                        titles.push(text);
                    }
                });
            }
            
            // Use crypto for better hashing - join titles with separator
            const crypto = require('crypto');
            const content = titles.join('||');
            const hash = crypto.createHash('md5').update(content).digest('hex');
            console.log(`[${type}] Extracted ${titles.length} titles, Hash: ${hash.slice(0, 12)}`);
            return { hash, content: content.slice(0, 500) };
        } catch (error) {
            if (attempt === retries) {
                console.error(`Error fetching ${type} (${attempt + 1}/${retries + 1}):`, error.message);
                return null;
            }
            console.log(`Retrying ${type}... (${attempt + 1}/${retries + 1})`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
        }
    }
    return null;
}

// Fetch top 5 results from a webpage
async function getTop5Results(url, type) {
    try {
        const response = await axios.get(url, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            validateStatus: function (status) {
                return status < 500;
            }
        });
        
        const $ = cheerio.load(response.data);
        const results = [];
        
        // Extract top 5 items based on type
        if (type === 'result') {
            // Look for result links in table rows
            $('table tr').each((i, row) => {
                if (results.length >= 5) return false;
                
                const $row = $(row);
                const link = $row.find('a').first();
                
                if (link.length > 0) {
                    const title = link.text().trim();
                    const href = link.attr('href') || '';
                    const date = $row.find('td').last().text().trim();
                    
                    if (title && title.length > 5 && !title.toLowerCase().includes('title') && !title.toLowerCase().includes('s.no')) {
                        results.push({ 
                            text: title,
                            link: href,
                            date: date
                        });
                    }
                }
            });
        } else if (type === 'datesheet') {
            // Look for datesheet links
            $('table tr').each((i, row) => {
                if (results.length >= 5) return false;
                
                const $row = $(row);
                const link = $row.find('a').first();
                
                if (link.length > 0) {
                    const title = link.text().trim();
                    const href = link.attr('href') || '';
                    const date = $row.find('td').last().text().trim();
                    
                    if (title && title.length > 5 && !title.toLowerCase().includes('title') && !title.toLowerCase().includes('s.no')) {
                        results.push({ 
                            text: title,
                            link: href,
                            date: date
                        });
                    }
                }
            });
        } else if (type === 'circular') {
            // Look for circular/notice links in table
            $('table tr').each((i, row) => {
                if (results.length >= 5) return false;
                
                const $row = $(row);
                const link = $row.find('a').first();
                
                if (link.length > 0) {
                    const title = link.text().trim();
                    const href = link.attr('href') || '';
                    
                    // Get date from last td
                    const dateTd = $row.find('td').last().text().trim();
                    
                    // Filter out header rows and navigation items
                    if (title && 
                        title.length > 5 && 
                        !title.toLowerCase().includes('title') && 
                        !title.toLowerCase().includes('notices') &&
                        !title.toLowerCase().includes('about university') &&
                        !title.toLowerCase().includes('acts, statute') &&
                        !title.toLowerCase().includes('university...') &&
                        dateTd.match(/\d{2}-\d{2}-\d{4}/)) {  // Must have date format
                        results.push({ 
                            text: title,
                            link: href,
                            date: dateTd
                        });
                    }
                }
            });
        }
        
        return results.slice(0, 5);
    } catch (error) {
        console.error(`Error fetching top 5 for ${type}:`, error.message);
        return [];
    }
}

// Clean and escape text for Telegram messages (HTML mode)
function cleanText(text) {
    return text
        .replace(/\s+/g, ' ')  // Replace multiple spaces/tabs/newlines with single space
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .trim()
        .slice(0, 200);  // Limit length
}

// Check for updates
async function checkForUpdates() {
    console.log('🔍 Checking for updates...');
    
    const checkStartTime = new Date();
    let changesDetected = [];
    
    for (const [type, url] of Object.entries(URLS)) {
        const result = await getPageHash(url, type);
        if (!result) continue;
        
        // Get last stored hash
        const lastUpdate = await updatesCollection.findOne({ type });
        
        if (!lastUpdate) {
            // First time, store the hash
            await updatesCollection.insertOne({
                type,
                hash: result.hash,
                lastChecked: new Date()
            });
            console.log(`✅ Initialized ${type}`);
            
            await logEvent('system_init', {
                type,
                message: `Initialized monitoring for ${type}`
            });
        } else if (lastUpdate.hash !== result.hash) {
            // Content changed, notify users
            console.log(`🔔 New update detected for ${type}!`);
            
            await updatesCollection.updateOne(
                { type },
                { 
                    $set: { 
                        hash: result.hash, 
                        lastChecked: new Date() 
                    } 
                }
            );
            
            changesDetected.push(type);
            
            // Log the change detection
            await logEvent('update_detected', {
                type,
                url,
                previousHash: lastUpdate.hash.slice(0, 20),
                newHash: result.hash.slice(0, 20)
            });
            
            // Send notifications to all users
            await notifyUsers(type, url);
        } else {
            // No change
            await updatesCollection.updateOne(
                { type },
                { $set: { lastChecked: new Date() } }
            );
        }
    }
    
    const checkEndTime = new Date();
    const duration = checkEndTime - checkStartTime;
    
    // Log check completion
    await logEvent('check_completed', {
        duration: `${duration}ms`,
        changesDetected: changesDetected.length > 0 ? changesDetected : 'none',
        timestamp: checkEndTime
    });
}

// Notify all subscribed users
async function notifyUsers(type, url) {
    const users = await usersCollection.find({ active: true }).toArray();
    
    // Fetch latest results to show in notification
    const latestResults = await getTop5Results(url, type);
    
    const icons = {
        result: '🎓',
        datesheet: '📅',
        circular: '📢'
    };
    
    const titles = {
        result: 'Exam Results Update',
        datesheet: 'Datesheet Update',
        circular: 'Circular/Notice Update'
    };
    
    const prefKeys = {
        result: 'results',
        datesheet: 'datesheet',
        circular: 'circular'
    };
    
    let message = `<b>${icons[type]} ${titles[type]}</b>\n━━━━━━━━━━━━━━━\n\n`;
    
    if (latestResults.length > 0) {
        message += '<b>Latest Updates:</b>\n\n';
        latestResults.slice(0, 3).forEach((item, i) => {
            if (item.date) {
                message += `📅 <i>${item.date}</i>\\n`;
            }
            const cleanedText = cleanText(item.text);
            message += `${i + 1}. ${cleanedText}\\n\\n`;
        });
    } else {
        message += 'New update available!\\n\\n';
    }
    
    message += `⏰ <i>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>`;
    
    let notifiedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    
            for (const user of users) {
        try {
            // Check if user has this notification type enabled
            const prefs = user.preferences || { results: true, datesheet: true, circular: true };
            const prefKey = prefKeys[type];
            
            if (prefs[prefKey] === true) {
                const sendOptions = {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔗 View All Updates', url }]]
                    }
                };

                await bot.telegram.sendMessage(user.chatId, message, sendOptions);
                notifiedCount++;
            } else {
                skippedCount++;
            }
        } catch (error) {
            console.error(`Failed to send to ${user.chatId}:`, error.message);
            failedCount++;
            
            // Mark user as inactive if blocked the bot
            if (error.response && error.response.error_code === 403) {
                await usersCollection.updateOne(
                    { chatId: user.chatId },
                    { $set: { active: false } }
                );
            }
        }
    }
    
    console.log(`✅ Notified ${notifiedCount}/${users.length} users about ${type}`);
    
    // Log notification statistics
    await logEvent('notification_sent', {
        type,
        totalUsers: users.length,
        notified: notifiedCount,
        skipped: skippedCount,
        failed: failedCount,
        updateCount: latestResults.length
    });
}

// Bot Commands
bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const user = await usersCollection.findOne({ chatId });
    
    const isNewUser = !user;
    
    if (!user) {
        await usersCollection.insertOne({
            chatId,
            username: ctx.from.username,
            firstName: ctx.from.first_name,
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
    } else {
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
            },
            { upsert: true }
        );
        
        await logEvent('user_resubscribed', {
            chatId,
            username: ctx.from.username,
            status: 'returning_user'
        });
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
    
    ctx.reply(
        `✨ Welcome to IPU Ranknest Bot!\n\n` +
        `Choose which notifications you want to receive:\n\n` +
        `Tap on any option below to enable/disable:\n`,
        { reply_markup: keyboard }
    );
});

bot.command('unsubscribe', async (ctx) => {
    if (!usersCollection) {
        console.warn('DB not connected when handling /unsubscribe');
        return ctx.reply('⚠️ Service temporarily unavailable (no DB). Try again later.');
    }

    await usersCollection.updateOne(
        { chatId: ctx.chat.id },
        { $set: { active: false } }
    );

    await logEvent('user_unsubscribed', {
        chatId: ctx.chat.id,
        username: ctx.from.username
    });

    ctx.reply('❌ You have been unsubscribed. Use /start to subscribe again.');
});

// Command to subscribe/resubscribe
bot.command('subscribe', async (ctx) => {
    try {
        if (!usersCollection) {
            console.warn('DB not connected when handling /subscribe');
            return ctx.reply('⚠️ Service temporarily unavailable (no DB). Try again later.');
        }
        const chatId = ctx.chat.id;
        const user = await usersCollection.findOne({ chatId });

        if (!user) {
            await usersCollection.insertOne({
                chatId,
                username: ctx.from.username,
                firstName: ctx.from.first_name,
                active: true,
                subscribedAt: new Date(),
                preferences: {
                    results: true,
                    datesheet: true,
                    circular: true
                }
            });
            await logEvent('user_subscribed', { chatId, username: ctx.from.username, status: 'subscribed_via_command' });
        } else {
            await usersCollection.updateOne({ chatId }, { $set: { active: true } });
            await logEvent('user_resubscribed', { chatId, username: ctx.from.username, status: 'resubscribed_via_command' });
        }

        ctx.reply('✅ You are now subscribed. Use /status to view preferences or /unsubscribe to stop.');
    } catch (error) {
        console.error('Error in /subscribe command:', error);
        ctx.reply('❌ An error occurred while subscribing.');
    }
});

// Command to show current subscription status and preferences
bot.command('status', async (ctx) => {
    try {
        if (!usersCollection) {
            console.warn('DB not connected when handling /status');
            return ctx.reply('⚠️ Service temporarily unavailable (no DB). Try again later.');
        }
        const chatId = ctx.chat.id;
        const user = await usersCollection.findOne({ chatId });

        if (!user) {
            return ctx.reply('⚠️ You are not subscribed. Use /start to subscribe.');
        }

        const prefs = user.preferences || { results: true, datesheet: true, circular: true };
        const lines = [
            `${user.active ? '✅ Subscribed' : '❌ Unsubscribed'}`,
            '',
            `Preferences:`,
            `${prefs.results ? '✅' : '❌'} Exam Results`,
            `${prefs.datesheet ? '✅' : '❌'} Datesheets`,
            `${prefs.circular ? '✅' : '❌'} Circulars/Notices`
        ];

        ctx.reply(lines.join('\n'));
    } catch (error) {
        console.error('Error in /status command:', error);
        ctx.reply('❌ Could not retrieve status.');
    }
});

// Command to check latest results
bot.command('results', async (ctx) => {
    try {
        // Fetch latest results from IPU website
        const latestResults = await getTop5Results(URLS.result, 'result');
        
        let message = `<b>🎓 Exam Results</b>\n━━━━━━━━━━━━━━━\n\n`;
        
        if (latestResults.length > 0) {
            message += '<b>Latest Results:</b>\n\n';
            latestResults.forEach((item, i) => {
                if (item.date) {
                    message += `📅 <i>${item.date}</i>\n`;
                }
                const cleanedText = cleanText(item.text);
                message += `${i + 1}. ${cleanedText}\n\n`;
            });
        } else {
            message += 'No recent results found or unable to fetch data.\n\n';
        }
        
        message += `⏰ <i>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>`;
        
        await logEvent('manual_check', {
            chatId: ctx.chat.id,
            username: ctx.from.username,
            type: 'results'
        });
        
        ctx.reply(message, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: '🔗 View All Results', url: URLS.result }]] } });
    } catch (error) {
        console.error('Error in /results command:', error);
        ctx.reply('❌ An error occurred while fetching results.');
    }
});

// Command to check latest datesheet
bot.command('datesheet', async (ctx) => {
    try {
        // Fetch latest datesheets from IPU website
        const latestResults = await getTop5Results(URLS.datesheet, 'datesheet');
        
        let message = `<b>📅 Datesheets</b>\n━━━━━━━━━━━━━━━\n\n`;
        
        if (latestResults.length > 0) {
            message += '<b>Latest Datesheets:</b>\n\n';
            latestResults.forEach((item, i) => {
                if (item.date) {
                    message += `📅 <i>${item.date}</i>\n`;
                }
                const cleanedText = cleanText(item.text);
                message += `${i + 1}. ${cleanedText}\n\n`;
            });
        } else {
            message += 'No recent datesheets found or unable to fetch data.\n\n';
        }
        
        message += `⏰ <i>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>`;
        
        await logEvent('manual_check', {
            chatId: ctx.chat.id,
            username: ctx.from.username,
            type: 'datesheet'
        });
        
        ctx.reply(message, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: '🔗 View All Datesheets', url: URLS.datesheet }]] } });
    } catch (error) {
        console.error('Error in /datesheet command:', error);
        ctx.reply('❌ An error occurred while fetching datesheet.');
    }
});

// Command to check latest circulars
bot.command('circular', async (ctx) => {
    try {
        // Fetch latest circulars from IPU website
        const latestResults = await getTop5Results(URLS.circular, 'circular');
        
        let message = `<b>📢 Circulars/Notices</b>\n━━━━━━━━━━━━━━━\n\n`;
        
        if (latestResults.length > 0) {
            message += '<b>Latest Circulars:</b>\n\n';
            latestResults.forEach((item, i) => {
                if (item.date) {
                    message += `📅 <i>${item.date}</i>\n`;
                }
                const cleanedText = cleanText(item.text);
                message += `${i + 1}. ${cleanedText}\n\n`;
            });
        } else {
            message += 'No recent circulars found or unable to fetch data.\n\n';
        }
        
        message += `⏰ <i>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>`;
        
        await logEvent('manual_check', {
            chatId: ctx.chat.id,
            username: ctx.from.username,
            type: 'circular'
        });
        
        ctx.reply(message, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: '🔗 View All Circulars', url: URLS.circular }]] } });
    } catch (error) {
        console.error('Error in /circular command:', error);
        ctx.reply('❌ An error occurred while fetching circulars.');
    }
});

// Handle callback queries for notification preferences
bot.action(/toggle_(.+)/, async (ctx) => {
    const type = ctx.match[1]; // results, datesheet, or circular
    const chatId = ctx.chat.id;
    
    // Get current preferences
    const user = await usersCollection.findOne({ chatId });
    const currentPrefs = user.preferences || { results: true, datesheet: true, circular: true };
    
    const oldValue = currentPrefs[type];
    
    // Toggle the preference
    currentPrefs[type] = !currentPrefs[type];
    
    // Update in database
    await usersCollection.updateOne(
        { chatId },
        { $set: { preferences: currentPrefs } }
    );
    
    // Log preference change
    await logEvent('preference_changed', {
        chatId,
        username: ctx.from.username,
        type,
        changed: `${oldValue} -> ${currentPrefs[type]}`,
        preferences: currentPrefs
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
        : `\n\n⚠️ No notifications enabled. Enable at least one!`;
    
    await ctx.editMessageText(
        `✨ Welcome to IPU Ranknest Bot!\n\n` +
        `Choose which notifications you want to receive:\n\n` +
        `Tap on any option below to enable/disable:` +
        statusText,
        { reply_markup: keyboard }
    );
    
    await ctx.answerCbQuery();
});

// Error handling
bot.catch(async (err, ctx) => {
    console.error('Bot Error:', err);
    
    await logEvent('bot_error', {
        error: err.message,
        stack: err.stack?.slice(0, 500),
        userId: ctx?.from?.id,
        username: ctx?.from?.username,
        updateType: ctx?.updateType
    });
});

// Initialize and start
async function main() {
    await connectDB();
    
    // Schedule checks based on environment
    if (process.env.NODE_ENV === 'production') {
        // Production: Check every 1 minute (Vercel limitation)
        cron.schedule('* * * * *', checkForUpdates);
    } else {
        // Development: Check every 5 minutes to avoid spam
        setInterval(checkForUpdates, 1 * 60 * 1000); // 5 minutes
    }
    
    // Initial check
    setTimeout(checkForUpdates, 5000);

    // For local development, use polling instead of webhooks
    if (process.env.NODE_ENV !== 'production') {
        
        // Check if Telegram should be disabled (API-only testing)
        if (process.env.DISABLE_TELEGRAM === 'true') {
            console.log('🔧 Telegram disabled - Running in API-only mode');
            console.log('🌐 Test URLs available:');
            console.log('   Health: http://localhost:3000/api/health');
            console.log('   Updates: http://localhost:3000/api/updates?key=internal-cron-trigger');
            console.log('💡 To enable Telegram: remove DISABLE_TELEGRAM=true from .env');
            return; // Skip Telegram setup
        }
        
        console.log('🔄 Starting bot in POLLING mode (local development)...');
        
        // Clear any existing webhooks first
        try {
            await bot.telegram.deleteWebhook({ drop_pending_updates: true });
            console.log('✅ Cleared existing webhooks');
        } catch (e) {
            console.log('⚠️ No webhooks to clear:', e.message);
        }
        
        bot.launch({ 
            polling: {
                timeout: 30,
                limit: 100,
                allowedUpdates: ['message', 'callback_query', 'inline_query']
            }
        });
        console.log('🤖 Bot started in polling mode!');
        return; // Skip webhook setup for local
    }

    // Start server
    app.listen(PORT, async () => {
        console.log(`🌍 Server running on port ${PORT}`);

        // Remove any old webhook first
        await bot.telegram.deleteWebhook();

        // Set new webhook
        await bot.telegram.setWebhook(`${DOMAIN}${webhookPath}`);

        console.log("🔗 Webhook set successfully!");
    });

    console.log("🤖 Bot started successfully!");
}

// Handle graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Export for Vercel
module.exports = bot;
module.exports.connectDB = connectDB;

// Start if running directly
if (require.main === module) {
    main();
}
