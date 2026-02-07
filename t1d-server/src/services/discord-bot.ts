import { Client, GatewayIntentBits, Message, Events, Partials } from 'discord.js';
import { env } from '../config/env.js';
import { query } from '../config/database.js';
import { createConfiguredAgentGraph } from '../agent/graph.js';
import { HumanMessage } from '@langchain/core/messages';
import { logContextSize } from '../utils/token-counter.js';

/**
 * Discord Bot Service
 * Provides two-way communication with Sage via Discord
 */
export class DiscordBot {
  private client: Client | null = null;
  private agent: any;
  private isReady: boolean = false;

  constructor() {
    this.agent = createConfiguredAgentGraph();
  }

  /**
   * Check if bot is configured
   */
  isConfigured(): boolean {
    return !!env.DISCORD_BOT_TOKEN;
  }

  /**
   * Start the Discord bot
   */
  async start() {
    if (!this.isConfigured()) {
      console.log('⚠️  Discord bot token not configured, skipping bot initialization');
      return;
    }

    if (this.client) {
      console.log('⚠️  Discord bot is already running');
      return;
    }

    try {
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
        ],
        partials: [
          Partials.Channel, // Required for DMs
        ],
      });

      // Handle ready event
      this.client.once(Events.ClientReady, (client) => {
        this.isReady = true;
        console.log(`✓ Discord bot connected as ${client.user.tag}`);
      });

      // Handle messages
      this.client.on(Events.MessageCreate, async (message) => {
        await this.handleMessage(message);
      });

      // Handle button interactions
      this.client.on(Events.InteractionCreate, async (interaction) => {
        await this.handleInteraction(interaction);
      });

      // Handle errors
      this.client.on('error', (error) => {
        console.error('Discord bot error:', error);
      });

      // Login
      await this.client.login(env.DISCORD_BOT_TOKEN);
    } catch (error) {
      console.error('Failed to start Discord bot:', error);
      throw error;
    }
  }

  /**
   * Stop the Discord bot
   */
  async stop() {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
      this.isReady = false;
      console.log('✓ Discord bot stopped');
    }
  }

  /**
   * Handle incoming Discord message
   */
  private async handleMessage(message: Message) {
    try {
      // Ignore bot messages
      if (message.author.bot) {
        return;
      }

      // Only respond to DMs or mentions
      const isDM = !message.guild;
      const isMentioned = message.mentions.has(this.client!.user!.id);

      if (!isDM && !isMentioned) {
        return;
      }

      console.log(`📨 Received ${isDM ? 'DM' : 'mention'} from ${message.author.tag}`);


      // Get user from Discord user ID
      const user = await this.getUserByDiscordId(message.author.id);

      if (!user) {
        // User not linked
        await message.reply(
          `👋 Hi! I'm Sage, your AI diabetes assistant.\n\n` +
          `To chat with me, you need to link your Discord account to your Sage account first.\n\n` +
          `**How to link:**\n` +
          `1. Log in to Sage at http://localhost:5173\n` +
          `2. Go to Settings\n` +
          `3. Enter your Discord User ID: \`${message.author.id}\`\n` +
          `4. Come back here and say hi!`
        );
        return;
      }

      // Show typing indicator
      await message.channel.sendTyping();

      // Get user's message content (remove mention if present)
      let content = message.content;
      if (isMentioned) {
        content = content.replace(/<@!?\d+>/g, '').trim();
      }

      // Run agent
      const response = await this.processMessage(user.id, user, content);

      // Send response (split if too long for Discord's 2000 char limit)
      if (response.length <= 2000) {
        await message.reply(response);
      } else {
        // Split into chunks
        const chunks = this.splitMessage(response, 2000);
        await message.reply(chunks[0]);
        for (let i = 1; i < chunks.length; i++) {
          await message.channel.send(chunks[i]);
        }
      }
    } catch (error) {
      console.error('Error handling Discord message:', error);
      try {
        await message.reply('Sorry, I encountered an error processing your message. Please try again later.');
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
      }
    }
  }

  /**
   * Handle button interactions from Discord
   */
  private async handleInteraction(interaction: any) {
    try {
      // Only handle button interactions
      if (!interaction.isButton()) {
        return;
      }

      console.log(`🔘 Button clicked: ${interaction.customId} by ${interaction.user.tag}`);

      // Parse custom_id: "messageId:actionId"
      const [messageId, actionId] = interaction.customId.split(':');

      if (!messageId || !actionId) {
        await interaction.reply({
          content: 'Invalid button action',
          ephemeral: true
        });
        return;
      }

      // Get user from Discord user ID
      const user = await this.getUserByDiscordId(interaction.user.id);

      if (!user) {
        await interaction.reply({
          content: 'You need to link your Discord account first. Go to Settings in the Sage app.',
          ephemeral: true
        });
        return;
      }

      // Get sage_message and extract action definition
      const messageResult = await query(
        `SELECT id, conversation_id, metadata
         FROM sage_messages
         WHERE id = $1 AND user_id = $2`,
        [messageId, user.id]
      );

      if (messageResult.rows.length === 0) {
        await interaction.reply({
          content: 'Message not found or expired',
          ephemeral: true
        });
        return;
      }

      const sageMessage = messageResult.rows[0];
      const actions = sageMessage.metadata?.actions || [];
      const action = actions.find((a: any) => a.id === actionId);

      if (!action) {
        await interaction.reply({
          content: 'Action not found',
          ephemeral: true
        });
        return;
      }

      // Defer the update (we'll respond via DM after processing)
      await interaction.deferUpdate();

      // Save action.message as user's chat message
      await query(
        `INSERT INTO chat_messages (conversation_id, user_id, role, content, metadata)
         VALUES ($1, $2, 'user', $3, $4)`,
        [
          sageMessage.conversation_id,
          user.id,
          action.message,
          JSON.stringify({
            actionResponse: true,
            actionId: action.id,
            messageId: messageId,
            timestamp: new Date().toISOString()
          })
        ]
      );

      // Mark sage_message as acknowledged
      await query(
        `UPDATE sage_messages
         SET acknowledged = true, acknowledged_at = NOW()
         WHERE id = $1`,
        [messageId]
      );

      console.log(`✓ Action response saved: "${action.message}" for message ${messageId}`);

      // Process the message through the agent
      const userCtx = {
        email: user.email,
        diagnosisType: user.diagnosis_type || undefined,
        diagnosisDate: user.diagnosis_date || undefined,
        timezone: user.timezone || undefined,
      };

      const response = await this.processMessage(user.id, user, action.message);

      // Remove buttons from original message by editing it
      await interaction.editReply({
        components: [] // Remove all action rows
      });

      // Send DM response to user
      const dmChannel = await interaction.user.createDM();
      if (response.length <= 2000) {
        await dmChannel.send(response);
      } else {
        const chunks = this.splitMessage(response, 2000);
        for (const chunk of chunks) {
          await dmChannel.send(chunk);
        }
      }

    } catch (error) {
      console.error('Error handling Discord interaction:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'Sorry, I encountered an error processing your action. Please try again.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
      }
    }
  }

  /**
   * Get Sage user by Discord user ID
   */
  private async getUserByDiscordId(discordUserId: string) {
    const result = await query(
      `SELECT id, email, diagnosis_type, diagnosis_date, timezone
       FROM users
       WHERE discord_user_id = $1`,
      [discordUserId]
    );

    return result.rows[0] || null;
  }

  /**
   * Process message through agent
   */
  private async processMessage(userId: string, user: any, content: string): Promise<string> {
    const userCtx = {
      email: user.email,
      diagnosisType: user.diagnosis_type || undefined,
      diagnosisDate: user.diagnosis_date || undefined,
      timezone: user.timezone || undefined,
    };

    // Log context size
    logContextSize([new HumanMessage(content)], userCtx, {
      label: 'Discord Bot Message',
      isFirstMessage: true,
    });

    const stream = await this.agent.stream({
      messages: [new HumanMessage(content)],
      userId,
      userContext: userCtx,
    }, {
      streamMode: 'values', // LangGraph 1.x explicit mode
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      // LangGraph 1.x returns state directly in 'values' mode
      if (chunk && typeof chunk === 'object' && 'messages' in chunk) {
        const messages = chunk.messages;
        if (Array.isArray(messages) && messages.length > 0) {
          const lastMessage = messages[messages.length - 1];
          const isAIMessage = lastMessage.constructor.name === 'AIMessage' ||
                             lastMessage.constructor.name === 'AIMessageChunk';
          const isFinalMessage = !lastMessage.tool_calls || lastMessage.tool_calls.length === 0;

          // Only use final AI messages (from synthesis node)
          if (isAIMessage && isFinalMessage && lastMessage.content && typeof lastMessage.content === 'string') {
            fullResponse = lastMessage.content;
          }
        }
      }
    }

    return fullResponse || 'I processed your message but had no response to give.';
  }

  /**
   * Split message into chunks that fit Discord's limit
   */
  private splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    const lines = text.split('\n');

    for (const line of lines) {
      if ((currentChunk + line + '\n').length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        // If single line is too long, split it by words
        if (line.length > maxLength) {
          const words = line.split(' ');
          for (const word of words) {
            if ((currentChunk + word + ' ').length > maxLength) {
              chunks.push(currentChunk.trim());
              currentChunk = word + ' ';
            } else {
              currentChunk += word + ' ';
            }
          }
        } else {
          currentChunk = line + '\n';
        }
      } else {
        currentChunk += line + '\n';
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}

// Singleton instance
export const discordBot = new DiscordBot();
