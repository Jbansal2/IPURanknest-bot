module.exports = async (req, res) => {
    res.status(200).json({ 
        status: 'active',
        service: 'notification-service',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
};
