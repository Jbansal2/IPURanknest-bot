const { MongoClient } = require('mongodb');
const axios = require('axios');
const cheerio = require('cheerio');
const { Telegraf } = require('telegraf');

let cachedDb = null;
let cachedClient = null;

async function connectDB() {
    if (cachedDb) {
        return cachedDb;
    }
    
    const client = new MongoClient(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        tls: true,
        tlsAllowInvalidCertificates: false,
        retryWrites: true,
        retryReads: true,
        maxPoolSize: 1,
    });
    await client.connect();
    cachedClient = client;
    const db = client.db('ipu_bot');
    cachedDb = db;
    return db;
}

const URLS = {
    result: "http://ggsipu.ac.in/ExamResults/ExamResultsmain.htm",
    datesheet: "http://ipu.ac.in/exam_datesheet.php",
    circular: "http://ipu.ac.in/notices.php"
};

// Verify request is authorized
function verifyRequest(req) {
    const authHeader = req.headers['x-api-key'] || req.query.key;
    // Allow explicit API key, internal cron token, or Vercel scheduled requests
    if (authHeader === process.env.API_KEY || authHeader === 'internal-cron-trigger') return true;
    if (req.headers['x-vercel-cron'] === 'true') return true;
    return false;
}

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
                    return status < 500;
                }
            });
            
            const $ = cheerio.load(response.data);
            
            let titles = [];
            $('table tr').each((i, row) => {
                if (titles.length >= 10) return false;
                const text = $(row).find('a').first().text().trim().replace(/\s+/g, ' ');
                if (text && text.length > 10 && !text.toLowerCase().includes('s.no') && !text.toLowerCase().includes('title')) {
                    titles.push(text);
                }
            });
            
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
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    return null;
}

// Helper function to clean text for HTML
function cleanText(text) {
    return text
        .replace(/\s+/g, ' ')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .trim()
        .slice(0, 200);
}

// Helper function to get top results
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
        
        // First try: extract from table rows (preferred)
        $('table tr').each((i, row) => {
            if (results.length >= 5) return false;

            const $row = $(row);
            const link = $row.find('a').first();

            if (link.length > 0) {
                const title = link.text().trim();
                const href = link.attr('href') || '';
                const dateTd = $row.find('td').last().text().trim();

                if (title && title.length > 5 && !title.toLowerCase().includes('title') && !title.toLowerCase().includes('s.no')) {
                    if (type === 'circular') {
                        if (!title.toLowerCase().includes('about university') &&
                            !title.toLowerCase().includes('acts, statute') &&
                            !title.toLowerCase().includes('university...') &&
                            dateTd.match(/\d{2}-\d{2}-\d{4}/)) {
                            results.push({ text: title, link: href, date: dateTd });
                        }
                    } else {
                        results.push({ text: title, link: href, date: dateTd });
                    }
                }
            }
        });

        // Fallback: if table-based extraction yields nothing, scan all anchors on the page
        if (results.length === 0) {
            console.log(`[${type}] Table extraction returned 0 items — falling back to scanning anchors`);
            const seen = new Set();
            $('a').each((i, a) => {
                if (results.length >= 5) return false;
                const $a = $(a);
                const text = $a.text().trim().replace(/\s+/g, ' ');
                const href = $a.attr('href') || '';
                if (!text || text.length <= 5) return;
                const ltext = text.toLowerCase();
                if (ltext.includes('read more') || ltext.includes('click here') || ltext.includes('home') || ltext.includes('title')) return;
                const key = `${text}||${href}`;
                if (seen.has(key)) return;
                seen.add(key);
                results.push({ text, link: href, date: '' });
            });
        }
        
        return results.slice(0, 5);
    } catch (error) {
        console.error(`Error fetching results for ${type}:`, error.message);
        return [];
    }
}

async function notifyUsers(bot, db, type, url) {
    const usersCollection = db.collection('users');
    const users = await usersCollection.find({ active: true }).toArray();
    
    // Fetch latest results
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
        message += '<b>📋 Latest Updates:</b>\n\n';
        latestResults.slice(0, 3).forEach((item, i) => {
            const cleanedText = cleanText(item.text);
            message += `${i + 1}. ${cleanedText}`;
            if (item.date) {
                message += `\n   📅 <i>${item.date}</i>`;
            }
            message += '\n\n';
        });
    } else {
        message += `🔔 New update detected!\n\n`;
    }
    
    message += `🔗 <a href="${url}">View All Updates</a>\n\n`;
    message += `⏰ <i>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>`;
    
    let successCount = 0;
    for (const user of users) {
        try {
            // Check if user has this notification type enabled
            const prefs = user.preferences || { results: true, datesheet: true, circular: true };
            const prefKey = prefKeys[type];
            
            if (prefs[prefKey] === true) {
                await bot.telegram.sendMessage(user.chatId, message, { parse_mode: 'HTML' });
                successCount++;
            }
        } catch (error) {
            console.error(`Failed to send to ${user.chatId}:`, error.message);
            if (error.response && error.response.error_code === 403) {
                await usersCollection.updateOne(
                    { chatId: user.chatId },
                    { $set: { active: false } }
                );
            }
        }
    }
    
    return successCount;
}

module.exports = async (req, res) => {
    try {
        // Verify authorization
        if (!verifyRequest(req)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const db = await connectDB();
        const updatesCollection = db.collection('updates');
        const bot = new Telegraf(process.env.BOT_TOKEN);
        // For testing: allow forcing notifications via query or header
        console.log('Request query:', req.query);
        const qForce = req.query && (req.query.force === true || req.query.force === 'true' || req.query.force === '1');
        const hForce = req.headers && (req.headers['x-force'] === 'true' || req.headers['x-force'] === '1');
        const forceNotify = qForce || hForce;
        if (forceNotify) {
            console.log('Force notify requested. Will send notifications regardless of hashes. (qForce=%s, hForce=%s)', qForce, hForce);
            const usersCount = await db.collection('users').countDocuments({ active: true });
            console.log('Active users:', usersCount);

            const results = [];
            for (const [type, url] of Object.entries(URLS)) {
                try {
                    const notifiedCount = await notifyUsers(bot, db, type, url);
                    console.log(`Forced notify for ${type}: sent to ${notifiedCount} users`);
                    results.push({ type, notified: notifiedCount });
                } catch (e) {
                    console.error(`Forced notify error for ${type}:`, e.message);
                    results.push({ type, error: e.message });
                }
            }

            return res.status(200).json({ success: true, forced: true, results });
        }
        
        let changesDetected = [];
        let checksPerformed = [];
        
        for (const [type, url] of Object.entries(URLS)) {
            const result = await getPageHash(url, type);
            if (!result) continue;
            
            const lastUpdate = await updatesCollection.findOne({ type });
            
            if (!lastUpdate) {
                await updatesCollection.insertOne({
                    type,
                    hash: result.hash,
                    lastChecked: new Date(),
                    lastChanged: new Date()
                });
                checksPerformed.push({ type, status: 'initialized', hash: result.hash });
            } else if (lastUpdate.hash !== result.hash) {
                console.log(`🔄 Change detected for ${type}! Old: ${lastUpdate.hash.slice(0, 8)}, New: ${result.hash.slice(0, 8)}`);
                
                await updatesCollection.updateOne(
                    { type },
                    { 
                        $set: { 
                            hash: result.hash, 
                            lastChecked: new Date(),
                            lastChanged: new Date()
                        } 
                    }
                );
                
                const usersCount = await db.collection('users').countDocuments({ active: true });
                console.log(`${type}: active users = ${usersCount}`);
                const notifiedCount = await notifyUsers(bot, db, type, url);
                console.log(`${type}: notified ${notifiedCount} users`);
                changesDetected.push({ type, notifiedUsers: notifiedCount, newHash: result.hash });
            } else {
                await updatesCollection.updateOne(
                    { type },
                    { $set: { lastChecked: new Date() } }
                );
                checksPerformed.push({ type, status: 'no_change', hash: result.hash });
            }
        }
        
        res.status(200).json({
            success: true,
            timestamp: new Date(),
            changes: changesDetected,
            checks: checksPerformed
        });
    } catch (error) {
        console.error('Check updates error:', error);
        res.status(500).json({ error: error.message });
    }
};