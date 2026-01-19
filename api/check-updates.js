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
    
    const client = await MongoClient.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        tls: true,
        tlsAllowInvalidCertificates: false,
        retryWrites: true,
        retryReads: true,
        maxPoolSize: 1,
    });
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
    return authHeader === process.env.API_KEY || authHeader === 'internal-cron-trigger';
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
            
            let content = '';
            if (type === 'result') {
                // Extract only table rows content, ignore timestamps/dates
                $('table tr').each((i, row) => {
                    const text = $(row).find('a').text().trim();
                    if (text && text.length > 5) {
                        content += text + '|';
                    }
                });
            } else if (type === 'datesheet') {
                $('table tr').each((i, row) => {
                    const text = $(row).find('a').text().trim();
                    if (text && text.length > 5) {
                        content += text + '|';
                    }
                });
            } else if (type === 'circular') {
                $('table tr').each((i, row) => {
                    const text = $(row).find('a').text().trim();
                    if (text && text.length > 5) {
                        content += text + '|';
                    }
                });
            }
            
            // Use crypto for better hashing
            const crypto = require('crypto');
            const hash = crypto.createHash('md5').update(content).digest('hex');
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
        message += '<b>Latest Updates:</b>\n\n';
        latestResults.slice(0, 3).forEach((item, i) => {
            const cleanedText = cleanText(item.text);
            message += `${i + 1}. ${cleanedText}`;
            if (item.date) {
                message += `\n   📅 <i>${item.date}</i>`;
            }
            message += '\n\n';
        });
    } else {
        message += 'New update available!\n\n';
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
                
                const notifiedCount = await notifyUsers(bot, db, type, url);
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
