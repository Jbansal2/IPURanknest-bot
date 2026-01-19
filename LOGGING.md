# 📊 Bot Logging & Monitoring System

## Overview
This bot maintains comprehensive logs in MongoDB to ensure transparency, debugging capability, and compliance with hosting provider policies.

## Log Types

### 1. System Events
- **system_init**: When monitoring starts for a URL type
- **check_completed**: After each update check cycle
  - Duration of check
  - Changes detected (if any)
  - Timestamp

### 2. Update Detection
- **update_detected**: When new content is found
  - Type (results/datesheet/circular)
  - URL
  - Hash comparison (previous vs new)

### 3. User Activities
- **user_subscribed**: New user starts the bot
  - Chat ID, username, first name
- **user_resubscribed**: Existing user restarts bot
- **user_unsubscribed**: User stops notifications
- **preference_changed**: User toggles notification preferences
  - Type changed
  - Before/after values

### 4. Notifications
- **notification_sent**: After sending update notifications
  - Total users
  - Successfully notified count
  - Skipped (preference disabled)
  - Failed (errors)
  - Update count

### 5. Errors
- **bot_error**: Any bot errors with stack trace

## MongoDB Schema

```javascript
{
  type: String,           // Event type
  data: Object,          // Event-specific data
  timestamp: Date,       // ISO timestamp
  date: String          // Human-readable date (IST)
}
```

## Why This Helps

### ✅ Transparency for Hosting Provider
1. **Legitimate Usage**: Clear audit trail shows bot is monitoring educational websites
2. **Rate Limiting**: Check frequency (10 seconds dev, 1 minute prod) is logged
3. **User Consent**: All subscriptions/unsubscriptions are logged
4. **Error Tracking**: System errors are caught and logged, not silently failing

### ✅ Debugging & Maintenance
1. **Issue Resolution**: Detailed logs help identify problems quickly
2. **Performance Monitoring**: Track check durations and notification delivery
3. **User Analytics**: Understand user preferences and engagement

### ✅ Compliance & Safety
1. **GDPR-friendly**: User actions are tracked with timestamps
2. **Abuse Prevention**: Can identify unusual patterns
3. **Service Quality**: Monitor notification delivery success rates

## Accessing Logs

Logs are stored in MongoDB collection: `logs`

### Query Examples:

**Recent errors:**
```javascript
db.logs.find({ type: 'bot_error' }).sort({ timestamp: -1 }).limit(10)
```

**User activity today:**
```javascript
db.logs.find({ 
  type: { $in: ['user_subscribed', 'user_unsubscribed'] },
  timestamp: { $gte: new Date(new Date().setHours(0,0,0,0)) }
})
```

**Notification stats:**
```javascript
db.logs.find({ type: 'notification_sent' }).sort({ timestamp: -1 })
```

## Log Retention

- Logs are kept indefinitely in MongoDB Atlas free tier (512MB limit)
- Monitor database size periodically
- Consider implementing log rotation after 30-90 days if needed

## Privacy Note

Logs contain:
- ✅ Chat IDs, usernames (non-sensitive Telegram identifiers)
- ✅ Timestamps, preferences
- ❌ NO message content
- ❌ NO personal information beyond Telegram public data
