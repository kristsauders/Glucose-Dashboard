import { env } from '../config/env.js';

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

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
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
   * Send a formatted Sage message
   */
  async sendSageMessage(
    type: MessageType,
    title: string,
    content: string,
    fields?: Array<{ name: string; value: string; inline?: boolean }>
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

    await this.sendMessage({ embeds: [embed] });
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
