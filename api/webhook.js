const bot = require('../bot');

let dbConnected = false;

module.exports = async (req, res) => {
    try {
        // Ensure MongoDB connection on first request
        if (!dbConnected) {
            await bot.connectDB();
            dbConnected = true;
        }

        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            res.status(200).json({ ok: true });
        } else {
            res.status(200).json({ status: 'Bot is running' });
        }
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
