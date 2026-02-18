import { query } from '../config/database.js';
import { researchService } from './research-service.js';
import { pushNotificationService } from './push-notification-service.js';

/**
 * Research Monitor - Automated research discovery and sharing
 * Runs 2-3x per week to discover new T1D research and share relevant findings
 */
export class ResearchMonitor {
  private checkInterval = 1 * 24 * 60 * 60 * 1000; // ~1 day
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

      const message = await this.formatResearchMessage(paper, summary, userId);

      // Send via sendProactiveMessageTool to create proper conversation
      const { sendProactiveMessageTool } = await import('../agent/tools.js');

      await sendProactiveMessageTool.invoke({
        userId,
        type: 'insight',
        title: '🔬 New Research Finding',
        content: message,
        actions: [
          {
            id: 'tell_more',
            label: 'Tell me more',
            message: 'Can you tell me more about this research and how it applies to me?'
          },
          {
            id: 'discuss',
            label: 'Let\'s discuss',
            message: 'I\'d like to discuss this study'
          }
        ]
      });

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
   * Format research message for user with AI-generated detailed analysis
   */
  private async formatResearchMessage(paper: any, summary: any, userId: string): Promise<string> {
    // Use AI to create a detailed, personalized analysis
    const { createHybridAgentGraph } = await import('../agent/hybrid-graph.js');

    // Fetch user preferences for model configuration
    const prefsResult = await query(
      `SELECT preferences FROM users WHERE id = $1`,
      [userId]
    );
    const userPreferences = prefsResult.rows[0]?.preferences || {};
    const userModelConfig = userPreferences.modelConfig;

    // Create user-specific agent
    const agent = createHybridAgentGraph('proactive', userModelConfig);

    const detailedPrompt = `You are analyzing a recent diabetes research paper to share with a user. Create a comprehensive, engaging summary that explains:

**Research Paper:**
Title: ${paper.title}
Journal: ${paper.journal}
Published: ${paper.publishedDate.getFullYear()}
Abstract: ${paper.abstract}

**Existing Summary:**
Key Findings: ${summary.keyFindings?.join('; ') || 'Not available'}
Clinical Implications: ${summary.clinicalImplications?.join('; ') || 'Not available'}
Limitations: ${summary.limitations?.join('; ') || 'Not available'}
Relevance to T1D: ${summary.relevanceToT1D || 'Not available'}

**Your Task:**
Create a detailed, engaging analysis (300-400 words) that includes:

1. **What Was Tested** (2-3 sentences)
   - Explain the study design, participants, and methodology in accessible language
   - What question were the researchers trying to answer?

2. **Key Findings & Insights** (3-4 sentences)
   - What did they discover? Be specific with numbers/percentages if available
   - What was surprising or particularly interesting about the results?
   - How strong was the evidence? (e.g., "showed significant improvement" vs "suggested potential benefit")

3. **Clinical Implications** (2-3 sentences)
   - What does this mean for people with Type 1 diabetes?
   - Are there practical takeaways or action items?

4. **Future Directions** (1-2 sentences)
   - What questions remain unanswered?
   - What should future research explore?

5. **Personalized Relevance** (2-3 sentences)
   - Use tools to check this user's recent data (glucose patterns, insulin doses, meals, exercise)
   - Explain how this research might specifically apply to their diabetes management
   - If the research relates to patterns you see in their data, mention it

**IMPORTANT:**
- Call tools to analyze the user's recent data (last 7-14 days) to personalize your analysis
- Tools available: get_recent_glucose, analyze_trends, get_meal_history, get_insulin_history, analyze_meal_patterns, get_detected_patterns
- Call 2-3 tools minimum to understand their patterns
- Be specific about how the research relates to what you observe in their data
- Use accessible language - avoid excessive jargon
- Be engaging and conversational, not academic
- End with: "Link: ${paper.url}"

Format your response as a cohesive, flowing analysis (not bullet points with headers). Make it feel like a knowledgeable friend explaining exciting research.`;

    try {
      const result = await agent.invoke({
        messages: [{ role: 'user', content: detailedPrompt }],
        userId,
        userContext: {
          email: '', // Not needed for this analysis
          timezone: 'America/New_York'
        }
      });

      const lastMessage = result.messages[result.messages.length - 1];
      const detailedAnalysis = typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

      return `🔬 New Research: ${paper.title}\n\n${detailedAnalysis}`;
    } catch (error) {
      console.error('[ResearchMonitor] Error generating detailed analysis:', error);

      // Fallback to simple format if AI analysis fails
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
