import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

async function testDiscord() {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error('❌ DISCORD_WEBHOOK_URL not set in .env file');
    console.log('\n📝 To set it up:');
    console.log('   1. Go to your Discord server');
    console.log('   2. Edit channel → Integrations → Webhooks');
    console.log('   3. Create webhook → Copy URL');
    console.log('   4. Add to .env: DISCORD_WEBHOOK_URL=<your-webhook-url>');
    process.exit(1);
  }

  console.log('🔗 Testing Discord webhook...');
  console.log(`   URL: ${webhookUrl.substring(0, 50)}...`);

  try {
    // Test 1: Simple message
    console.log('\n📤 Test 1: Sending simple message...');
    const response1 = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: '👋 Hello from Sage! This is a test message.',
      }),
    });

    if (!response1.ok) {
      throw new Error(`Failed: ${response1.status} ${await response1.text()}`);
    }
    console.log('   ✅ Simple message sent!');

    // Wait a bit between messages
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Insight message with embed
    console.log('\n📤 Test 2: Sending insight with embed...');
    const response2 = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        embeds: [{
          title: '💡 Pattern Detected',
          description: 'I noticed your glucose tends to rise between 5-7am. This could be the dawn phenomenon, a common pattern where hormones cause glucose to rise in the early morning.',
          color: 0x3498db, // Blue
          fields: [
            {
              name: '📊 Average Morning Glucose',
              value: '142 mg/dL',
              inline: true,
            },
            {
              name: '📈 Rise Amount',
              value: '+28 mg/dL',
              inline: true,
            },
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Sage - Your AI Diabetes Assistant',
          },
        }],
      }),
    });

    if (!response2.ok) {
      throw new Error(`Failed: ${response2.status} ${await response2.text()}`);
    }
    console.log('   ✅ Insight embed sent!');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 3: Question message
    console.log('\n📤 Test 3: Sending question...');
    const response3 = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        embeds: [{
          title: '🤔 Question for you',
          description: 'I noticed you had several readings above 200 after lunch yesterday. Did you eat something different or miss your bolus?',
          color: 0x9b59b6, // Purple
          fields: [
            {
              name: 'Context',
              value: 'Your glucose spiked from 118 to 247 between 12:30-2:00pm',
            },
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Sage - Your AI Diabetes Assistant',
          },
        }],
      }),
    });

    if (!response3.ok) {
      throw new Error(`Failed: ${response3.status} ${await response3.text()}`);
    }
    console.log('   ✅ Question embed sent!');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 4: Daily summary
    console.log('\n📤 Test 4: Sending daily summary...');
    const response4 = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        embeds: [{
          title: '📅 Daily Summary',
          description: 'Here\'s how yesterday went. Your time in range was solid at 68%, but I noticed some overnight lows that might be worth adjusting your basal for.',
          color: 0xe67e22, // Orange
          fields: [
            {
              name: '📊 Average Glucose',
              value: '142.3 mg/dL',
              inline: true,
            },
            {
              name: '🎯 Time in Range',
              value: '68.2%',
              inline: true,
            },
            {
              name: '📈 Time Above Range',
              value: '24.5%',
              inline: true,
            },
            {
              name: '📉 Time Below Range',
              value: '7.3%',
              inline: true,
            },
            {
              name: '📏 Variability',
              value: '42.1 mg/dL',
              inline: true,
            },
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Sage - Your AI Diabetes Assistant',
          },
        }],
      }),
    });

    if (!response4.ok) {
      throw new Error(`Failed: ${response4.status} ${await response4.text()}`);
    }
    console.log('   ✅ Daily summary sent!');

    console.log('\n✅ All Discord tests passed!');
    console.log('   Check your Discord channel to see the messages.');

  } catch (error) {
    console.error('\n❌ Discord test failed:', error.message);
    process.exit(1);
  }
}

testDiscord();
