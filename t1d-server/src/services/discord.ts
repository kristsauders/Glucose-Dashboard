import { env } from '../config/env.js';
import type { ActionButton } from './push-notification-service.js';

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  timestamp?: string;
  footer?: {
    text: string;
  };
}

export interface DiscordButton {
  type: 2;  // Button component type
  style: 1 | 2 | 3 | 4;  // Primary, Secondary, Success, Danger
  label: string;
  custom_id: string;
}

export interface DiscordActionRow {
  type: 1;  // Action row type
  components: DiscordButton[];
}

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: DiscordActionRow[];  // Action buttons
}

export type MessageType = 'insight' | 'question' | 'suggestion' | 'daily_summary';

/**
 * Discord service for sending proactive messages from Sage
 */
export class DiscordService {
  private webhookUrl: string | undefined;

  constructor() {
    this.webhookUrl = env.DISCORD_WEBHOOK_URL;
  }

  /**
   * Check if Discord is configured
   */
  isConfigured(): boolean {
    return !!this.webhookUrl;
  }

  /**
   * Send a message to Discord
   */
  async sendMessage(message: DiscordMessage): Promise<void> {
    if (!this.webhookUrl) {
      console.warn('Discord webhook URL not configured, skipping message');
      return;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Discord API error: ${response.status} ${errorText}`);
      }
    } catch (error) {
      console.error('Failed to send Discord message:', error);
      throw error;
    }
  }

  /**
   * Send a formatted Sage message with optional action buttons
   */
  async sendSageMessage(
    type: MessageType,
    title: string,
    content: string,
    fields?: Array<{ name: string; value: string; inline?: boolean }>,
    actions?: ActionButton[],
    messageId?: string
  ): Promise<void> {
    const colors = {
      insight: 0x3498db, // Blue
      question: 0x9b59b6, // Purple
      suggestion: 0x2ecc71, // Green
      daily_summary: 0xe67e22, // Orange
    };

    const embed: DiscordEmbed = {
      title,
      description: content,
      color: colors[type],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Sage - Your AI Diabetes Assistant',
      },
    };

    if (fields && fields.length > 0) {
      embed.fields = fields;
    }

    // Convert actions to Discord button components
    const components: DiscordActionRow[] | undefined = actions && actions.length > 0 && messageId ? [{
      type: 1,
      components: actions.slice(0, 5).map((action) => {  // Discord allows max 5 buttons per row
        // Map action style to Discord button style
        const styleMap = {
          primary: 1,
          secondary: 2,
          success: 3,
          danger: 4
        };

        return {
          type: 2,
          style: action.style ? styleMap[action.style] : 2,  // Default to secondary
          label: action.label.substring(0, 80),  // Discord max label length
          custom_id: `${messageId}:${action.id}`  // Embed messageId for tracking
        };
      })
    }] : undefined;

    await this.sendMessage({ embeds: [embed], components });
  }

  /**
   * Send an insight message
   */
  async sendInsight(
    title: string,
    content: string,
    fields?: Array<{ name: string; value: string; inline?: boolean }>
  ): Promise<void> {
    return this.sendSageMessage('insight', title, content, fields);
  }

  /**
   * Send a question message
   */
  async sendQuestion(
    question: string,
    context?: string
  ): Promise<void> {
    return this.sendSageMessage('question', '🤔 Question for you', question,
      context ? [{ name: 'Context', value: context }] : undefined
    );
  }

  /**
   * Send a suggestion message
   */
  async sendSuggestion(
    title: string,
    content: string,
    fields?: Array<{ name: string; value: string; inline?: boolean }>
  ): Promise<void> {
    return this.sendSageMessage('suggestion', title, content, fields);
  }

  /**
   * Send a daily summary
   */
  async sendDailySummary(
    summary: string,
    stats: {
      avgGlucose: number;
      timeInRange: number;
      timeAbove: number;
      timeBelow: number;
      stdDev: number;
    }
  ): Promise<void> {
    const fields = [
      {
        name: '📊 Average Glucose',
        value: `${stats.avgGlucose.toFixed(1)} mg/dL`,
        inline: true,
      },
      {
        name: '🎯 Time in Range',
        value: `${stats.timeInRange.toFixed(1)}%`,
        inline: true,
      },
      {
        name: '📈 Time Above Range',
        value: `${stats.timeAbove.toFixed(1)}%`,
        inline: true,
      },
      {
        name: '📉 Time Below Range',
        value: `${stats.timeBelow.toFixed(1)}%`,
        inline: true,
      },
      {
        name: '📏 Variability',
        value: `${stats.stdDev.toFixed(1)} mg/dL`,
        inline: true,
      },
    ];

    await this.sendSageMessage('daily_summary', '📅 Daily Summary', summary, fields);
  }
}

// Singleton instance
export const discordService = new DiscordService();
