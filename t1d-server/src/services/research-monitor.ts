import { query } from '../config/database.js';
import { researchService } from './research-service.js';
import { pushNotificationService } from './push-notification-service.js';

/**
 * Research Monitor - Automated research discovery and sharing
 * Runs 2-3x per week to discover new T1D research and share relevant findings
 */
export class ResearchMonitor {
  private checkInterval = 2.5 * 24 * 60 * 60 * 1000; // ~2.5 days
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Start the research monitor
   */
  start() {
    if (this.timer) {
      console.log('⚠️  Research monitor already running');
      return;
    }

    console.log('🔬 Starting research monitor (checks every ~2.5 days)');

    // Don't run immediately on start to avoid rate limiting
    // Will run on first scheduled interval

    // Schedule recurring checks
    this.timer = setInterval(() => {
      this.runScheduledCheck().catch(err => {
        console.error('Research monitor scheduled check failed:', err);
      });
    }, this.checkInterval);
  }

  /**
   * Stop the research monitor
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('🔬 Research monitor stopped');
    }
  }

  /**
   * Run a scheduled research check
   */
  async runScheduledCheck() {
    if (this.isRunning) {
      console.log('[ResearchMonitor] Check already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('🔬 Starting scheduled research check...');

      // Update monitoring state
      await query(
        'UPDATE research_monitoring_state SET last_scheduled_check = NOW(), updated_at = NOW()'
      );

      // Step 1: Get all research topics
      const topics = await researchService.getResearchTopics();
      console.log(`[ResearchMonitor] Found ${topics.length} research topics`);

      let totalPapersDiscovered = 0;

      // Step 2: Search for new papers in each topic
      for (let i = 0; i < topics.length; i++) {
        const topic = topics[i];
        try {
          console.log(`[ResearchMonitor] Searching: ${topic.name}`);

          // Search for papers from last 6 months
          const currentYear = new Date().getFullYear();
          const papers = await researchService.searchPapers(
            topic.query,
            5, // Max 5 papers per topic
            currentYear - 1 // Papers from last year
          );

          console.log(`[ResearchMonitor] Found ${papers.length} papers for "${topic.name}"`);
          totalPapersDiscovered += papers.length;

          // Summarize new papers
          for (const paper of papers) {
            if (!paper.summary) {
              await researchService.summarizePaper(paper);
            }
          }

          // Update topic last checked
          await researchService.updateTopicLastChecked(topic.id);

          // Add delay between topics to avoid rate limiting (except after last topic)
          if (i < topics.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
          }

        } catch (error) {
          console.error(`[ResearchMonitor] Error processing topic "${topic.name}":`, error);
        }
      }

      // Step 3: Analyze relevance for active users
      const activeUsers = await this.getActiveUsers();
      console.log(`[ResearchMonitor] Analyzing relevance for ${activeUsers.length} active users`);

      for (const user of activeUsers) {
        try {
          await this.analyzeRelevanceForUser(user.id);
        } catch (error) {
          console.error(`[ResearchMonitor] Error analyzing for user ${user.id}:`, error);
        }
      }

      // Step 4: Send proactive messages for high-relevance papers
      let usersNotified = 0;
      for (const user of activeUsers) {
        try {
          const sent = await this.sendResearchUpdatesToUser(user.id);
          if (sent) usersNotified++;
        } catch (error) {
          console.error(`[ResearchMonitor] Error sending updates to user ${user.id}:`, error);
        }
      }

      // Update monitoring state
      await query(
        `UPDATE research_monitoring_state
         SET last_successful_check = NOW(),
             next_scheduled_check = NOW() + INTERVAL '2.5 days',
             papers_discovered_last_run = $1,
             users_notified_last_run = $2,
             updated_at = NOW()`,
        [totalPapersDiscovered, usersNotified]
      );

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✓ Research check complete (${duration}s): ${totalPapersDiscovered} papers, ${usersNotified} users notified`);

    } catch (error) {
      console.error('[ResearchMonitor] Scheduled check failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get active users who have research enabled
   */
  private async getActiveUsers(): Promise<Array<{ id: string; email: string }>> {
    try {
      const result = await query(
        `SELECT DISTINCT u.id, u.email
         FROM users u
         WHERE (u.research_preferences->>'enabled')::boolean = true
         AND EXISTS (
           SELECT 1 FROM glucose_readings gr
           WHERE gr.user_id = u.id
           AND gr.timestamp >= NOW() - INTERVAL '30 days'
         )`
      );
      return result.rows;
    } catch (error) {
      console.error('[ResearchMonitor] Error getting active users:', error);
      return [];
    }
  }

  /**
   * Analyze relevance of recent papers for a user
   */
  private async analyzeRelevanceForUser(userId: string): Promise<void> {
    try {
      // Get papers that haven't been analyzed for this user yet
      const result = await query(
        `SELECT p.id
         FROM research_papers p
         WHERE p.published_date >= NOW() - INTERVAL '6 months'
           AND NOT EXISTS (
             SELECT 1 FROM user_research_reviews urr
             WHERE urr.paper_id = p.id AND urr.user_id = $1
           )
         LIMIT 20`,
        [userId]
      );

      for (const row of result.rows) {
        await researchService.analyzeRelevanceForUser(row.id, userId);
      }
    } catch (error) {
      console.error(`[ResearchMonitor] Error analyzing relevance for user ${userId}:`, error);
    }
  }

  /**
   * Send research updates to a user
   */
  private async sendResearchUpdatesToUser(userId: string): Promise<boolean> {
    try {
      // Check user preferences
      const userResult = await query(
        `SELECT email, research_preferences, notification_preferences
         FROM users WHERE id = $1`,
        [userId]
      );

      if (userResult.rows.length === 0) return false;

      const user = userResult.rows[0];
      const researchPrefs = user.research_preferences || {};
      const notificationPrefs = user.notification_preferences || {};

      // Check if research updates are enabled
      if (!researchPrefs.enabled) return false;

      // Check max papers per week limit
      const maxPapersPerWeek = researchPrefs.max_papers_per_week || 2;

      // Count papers shared in last 7 days
      const sharedCountResult = await query(
        `SELECT COUNT(*) as count
         FROM user_research_reviews
         WHERE user_id = $1
           AND shared_via_proactive = TRUE
           AND shared_at >= NOW() - INTERVAL '7 days'`,
        [userId]
      );

      const sharedThisWeek = parseInt(sharedCountResult.rows[0]?.count || '0');
      if (sharedThisWeek >= maxPapersPerWeek) {
        console.log(`[ResearchMonitor] User ${user.email} already received max papers this week`);
        return false;
      }

      // Get high-relevance papers that haven't been shared
      const papers = await researchService.getHighRelevancePapersForUser(userId, 2);

      if (papers.length === 0) {
        return false;
      }

      // Send proactive message with research findings
      const paper = papers[0]; // Send one at a time
      const summary = paper.summary || await researchService.summarizePaper(paper);

      const message = this.formatResearchMessage(paper, summary);

      // Send via push notification if enabled
      if (notificationPrefs.proactive_enabled) {
        await pushNotificationService.sendToUser(userId, {
          title: '🔬 New Research Finding',
          body: `New study: ${paper.title.substring(0, 80)}...`,
          icon: '/sage-icon.png',
          data: {
            conversationId: '', // Will be created by tool
            url: '/chat'
          }
        });
      }

      // Mark as shared
      await researchService.markPaperAsShared(userId, paper.id);

      console.log(`[ResearchMonitor] Sent research update to ${user.email}`);
      return true;

    } catch (error) {
      console.error(`[ResearchMonitor] Error sending updates to user:`, error);
      return false;
    }
  }

  /**
   * Format research message for user
   */
  private formatResearchMessage(paper: any, summary: any): string {
    const keyFindings = summary.keyFindings?.slice(0, 3).map((f: string) => `- ${f}`).join('\n') || '';
    const implications = summary.clinicalImplications?.slice(0, 2).map((i: string) => `- ${i}`).join('\n') || '';

    return `🔬 New Research: ${paper.title}

**Key Findings:**
${keyFindings}

**Clinical Implications:**
${implications}

**Study:** ${paper.journal} (${paper.publishedDate.getFullYear()})
**Link:** ${paper.url}

This study might be relevant to your diabetes management. Would you like to discuss any of these findings?`;
  }

  /**
   * Handle on-demand research request
   */
  async handleOnDemandRequest(userId: string, topic: string): Promise<string> {
    try {
      console.log(`🔬 On-demand research request from user: "${topic}"`);

      // Create research request record
      const requestResult = await query(
        `INSERT INTO research_requests (user_id, topic, status)
         VALUES ($1, $2, 'processing')
         RETURNING id`,
        [userId, topic]
      );
      const requestId = requestResult.rows[0].id;

      // Search for papers (async)
      const papers = await researchService.searchPapers(topic, 5, new Date().getFullYear() - 2);

      console.log(`[ResearchMonitor] Found ${papers.length} papers for on-demand request`);

      // Analyze relevance
      for (const paper of papers) {
        if (!paper.summary) {
          await researchService.summarizePaper(paper);
        }
        await researchService.analyzeRelevanceForUser(paper.id, userId);
      }

      // Get high-relevance papers
      const relevantPapers = await researchService.getHighRelevancePapersForUser(userId, 3);

      // Update request status
      await query(
        `UPDATE research_requests
         SET status = 'completed',
             papers_found = $1,
             completed_at = NOW()
         WHERE id = $2`,
        [papers.length, requestId]
      );

      if (relevantPapers.length === 0) {
        return `I searched for research on "${topic}" but didn't find any highly relevant papers. This might be because it's a very specific topic or the research is limited. Would you like me to broaden the search?`;
      }

      // Format findings
      let response = `I found ${relevantPapers.length} relevant research paper(s) on "${topic}":\n\n`;

      for (let i = 0; i < relevantPapers.length; i++) {
        const paper = relevantPapers[i];
        const summary = paper.summary || await researchService.summarizePaper(paper);

        response += `**${i + 1}. ${paper.title}**\n`;
        response += `${paper.journal} (${paper.publishedDate.getFullYear()})\n\n`;
        response += `Key finding: ${summary.keyFindings?.[0] || 'Summary not available'}\n\n`;
        response += `[Read more](${paper.url})\n\n`;
      }

      response += `Would you like me to explain any of these studies in more detail?`;

      return response;

    } catch (error) {
      console.error('[ResearchMonitor] On-demand request error:', error);
      return `I encountered an error while researching "${topic}". Please try again later.`;
    }
  }
}

// Singleton instance
export const researchMonitor = new ResearchMonitor();
