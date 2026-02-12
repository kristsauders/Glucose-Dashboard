import { query } from '../src/config/database.js';
import { pushNotificationService } from '../src/services/push-notification-service.js';

async function testNotification() {
  try {
    // Get the first user
    const userResult = await query('SELECT id, email FROM users LIMIT 1');

    if (userResult.rows.length === 0) {
      console.error('No users found in database');
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log(`Testing notification for user: ${user.email} (${user.id})`);

    // Create a test conversation
    const convResult = await query(
      `INSERT INTO conversations (user_id, title)
       VALUES ($1, 'Test Proactive Notification')
       RETURNING id`,
      [user.id]
    );

    const conversationId = convResult.rows[0].id;
    console.log(`Created test conversation: ${conversationId}`);

    // Add a test message
    await query(
      `INSERT INTO chat_messages (user_id, conversation_id, role, content, metadata)
       VALUES ($1, $2, 'assistant', $3, $4)`,
      [
        user.id,
        conversationId,
        'This is a test notification message to verify deep-linking works correctly.',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          type: 'proactive',
          messageType: 'test',
        }),
      ]
    );

    console.log('Added test message to conversation');

    // Send push notification with conversationId
    const payload = {
      title: '🧪 Test Notification',
      body: 'Click to verify conversation loading works correctly',
      icon: '/sage-icon.png',
      badge: '/sage-badge.png',
      data: {
        conversationId,
        messageId: 'test-message-id',
        url: `/chat?conversation=${conversationId}`,
      },
    };

    console.log('\nNotification payload:');
    console.log(JSON.stringify(payload, null, 2));
    console.log(`\nKey field: data.conversationId = ${payload.data.conversationId}`);

    await pushNotificationService.sendToUser(user.id, payload);

    console.log('\n✓ Test notification sent!');
    console.log('\nWhat to check:');
    console.log('1. Open browser DevTools console');
    console.log('2. Click the notification when it appears');
    console.log('3. Look for these log lines:');
    console.log('   [Service Worker] Extracted conversationId: ' + conversationId);
    console.log('   [Deep-Link] Attempting to open conversation: ' + conversationId);
    console.log('   [Load Conversation] Loading conversation: ' + conversationId);
    console.log('   [GET /conversations/' + conversationId + '] Found 1 messages');
    console.log('\n4. The chat should load with the test message visible');
    console.log(`\nConversation ID to verify: ${conversationId}`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testNotification();
