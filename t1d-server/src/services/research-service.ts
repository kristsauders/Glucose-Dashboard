import OpenAI from 'openai';
import { env } from '../config/env.js';
import { query } from '../config/database.js';
import { pubmedService, type PubMedPaper } from '../integrations/pubmed.js';
import { pushNotificationService } from './push-notification-service.js';

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export interface ResearchPaper {
  id: string;
  externalId: string;
  source: string;
  title: string;
  authors: string[];
  journal: string;
  publishedDate: Date;
  abstract: string;
  url: string;
  doi?: string;
  summary?: PaperSummary;
}

export interface PaperSummary {
  keyFindings: string[];
  clinicalImplications: string[];
  limitations: string[];
  relevanceToT1D: string;
}

export interface UserRelevanceAnalysis {
  score: number; // 0.0 to 1.0
  reasons: string[];
  personalRelevance?: string;
}

export class ResearchService {
  /**
   * Search for research papers on a topic
   */
  async searchPapers(
    query: string,
    maxResults: number = 10,
    startYear?: number
  ): Promise<ResearchPaper[]> {
    try {
      const pubmedPapers = await pubmedService.searchPapers(query, maxResults, startYear);

      // Store papers in database
      const papers: ResearchPaper[] = [];
      for (const pubmedPaper of pubmedPapers) {
        const paper = await this.storePaper(pubmedPaper);
        if (paper) papers.push(paper);
      }

      return papers;
    } catch (error) {
      console.error('[ResearchService] Search error:', error);
      throw error;
    }
  }

  /**
   * Store a paper in the database
   */
  private async storePaper(pubmedPaper: PubMedPaper): Promise<ResearchPaper | null> {
    try {
      const result = await query(
        `INSERT INTO research_papers (external_id, source, title, authors, journal, published_date, abstract, url, doi)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (external_id) DO UPDATE
         SET title = EXCLUDED.title,
             authors = EXCLUDED.authors,
             journal = EXCLUDED.journal,
             abstract = EXCLUDED.abstract,
             updated_at = NOW()
         RETURNING id, external_id, source, title, authors, journal, published_date, abstract, url, doi, summary`,
        [
          pubmedPaper.pmid,
          'pubmed',
          pubmedPaper.title,
          pubmedPaper.authors,
          pubmedPaper.journal,
          pubmedPaper.publishedDate,
          pubmedPaper.abstract,
          pubmedPaper.url,
          pubmedPaper.doi || null
        ]
      );

      const row = result.rows[0];
      return {
        id: row.id,
        externalId: row.external_id,
        source: row.source,
        title: row.title,
        authors: row.authors,
        journal: row.journal,
        publishedDate: new Date(row.published_date),
        abstract: row.abstract,
        url: row.url,
        doi: row.doi,
        summary: row.summary
      };
    } catch (error) {
      console.error('[ResearchService] Error storing paper:', error);
      return null;
    }
  }

  /**
   * Summarize a research paper using AI
   */
  async summarizePaper(paper: ResearchPaper): Promise<PaperSummary> {
    try {
      const prompt = `Analyze this diabetes research paper and extract key information:

Title: ${paper.title}
Journal: ${paper.journal}
Abstract: ${paper.abstract}

Provide a structured analysis:
1. Key findings (3-5 main takeaways)
2. Clinical implications (how this could affect diabetes management)
3. Study limitations (sample size, duration, etc)
4. Relevance to Type 1 Diabetes management

Format as JSON with keys: keyFindings (array), clinicalImplications (array), limitations (array), relevanceToT1D (string)`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const summary = JSON.parse(completion.choices[0].message.content || '{}');

      // Store summary in database
      await query(
        `UPDATE research_papers SET summary = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(summary), paper.id]
      );

      return summary;
    } catch (error) {
      console.error('[ResearchService] Summarization error:', error);
      // Return basic summary on error
      return {
        keyFindings: ['Summary not available'],
        clinicalImplications: [],
        limitations: [],
        relevanceToT1D: 'Unable to analyze at this time'
      };
    }
  }

  /**
   * Analyze paper relevance for a specific user
   */
  async analyzeRelevanceForUser(
    paperId: string,
    userId: string
  ): Promise<UserRelevanceAnalysis> {
    try {
      // Get paper
      const paperResult = await query(
        'SELECT * FROM research_papers WHERE id = $1',
        [paperId]
      );
      if (paperResult.rows.length === 0) {
        throw new Error('Paper not found');
      }
      const paper = paperResult.rows[0];

      // Get user's recent patterns and challenges
      const userContext = await this.getUserResearchContext(userId);

      // Use AI to analyze relevance
      const prompt = `Analyze the relevance of this research paper to a specific diabetes patient:

Paper: ${paper.title}
Abstract: ${paper.abstract}

User Context:
${userContext}

Rate relevance from 0.0 to 1.0 and explain why this paper is or isn't relevant to this specific user.

Format as JSON: { score: number, reasons: string[], personalRelevance: string }`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const analysis = JSON.parse(completion.choices[0].message.content || '{}');

      // Store relevance analysis
      await query(
        `INSERT INTO user_research_reviews (user_id, paper_id, relevance_score, relevance_reasons)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, paper_id) DO UPDATE
         SET relevance_score = EXCLUDED.relevance_score,
             relevance_reasons = EXCLUDED.relevance_reasons,
             updated_at = NOW()`,
        [userId, paperId, analysis.score || 0, analysis.reasons || []]
      );

      return analysis;
    } catch (error) {
      console.error('[ResearchService] Relevance analysis error:', error);
      return { score: 0, reasons: ['Unable to analyze relevance'] };
    }
  }

  /**
   * Get user context for research relevance analysis
   */
  private async getUserResearchContext(userId: string): Promise<string> {
    try {
      // Get user info
      const userResult = await query(
        'SELECT diagnosis_type, diagnosis_date FROM users WHERE id = $1',
        [userId]
      );
      const user = userResult.rows[0];

      // Get recent glucose stats
      const statsResult = await query(
        `SELECT
           AVG(glucose) as avg_glucose,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY glucose) as median_glucose
         FROM glucose_readings
         WHERE user_id = $1 AND timestamp >= NOW() - INTERVAL '30 days'`,
        [userId]
      );

      // Try to get patterns (table may not exist yet)
      let patternsText = 'No patterns available yet';
      try {
        const patternsResult = await query(
          `SELECT pattern_type, description, confidence
           FROM detected_patterns
           WHERE user_id = $1 AND confidence > 0.6
           ORDER BY detected_at DESC
           LIMIT 5`,
          [userId]
        );
        if (patternsResult.rows.length > 0) {
          patternsText = patternsResult.rows.map(p => p.description).join('; ');
        }
      } catch (err) {
        // detected_patterns table doesn't exist yet, skip patterns
      }

      const avgGlucose = statsResult.rows[0]?.avg_glucose;
      const avgGlucoseStr = avgGlucose ? Number(avgGlucose).toFixed(0) : 'N/A';

      const context = `
- Diagnosis: ${user?.diagnosis_type || 'Type 1 Diabetes'}
- Recent patterns: ${patternsText}
- Average glucose (30d): ${avgGlucoseStr} mg/dL
      `.trim();

      return context;
    } catch (error) {
      console.error('[ResearchService] Error getting user context:', error);
      return 'Type 1 Diabetes patient';
    }
  }

  /**
   * Get high-relevance papers for a user that haven't been shared yet
   */
  async getHighRelevancePapersForUser(userId: string, limit: number = 5): Promise<ResearchPaper[]> {
    try {
      const result = await query(
        `SELECT p.*, urr.relevance_score
         FROM research_papers p
         INNER JOIN user_research_reviews urr ON p.id = urr.paper_id
         WHERE urr.user_id = $1
           AND urr.relevance_score >= 0.7
           AND (urr.shared_via_proactive = FALSE OR urr.shared_via_proactive IS NULL)
         ORDER BY urr.relevance_score DESC, p.published_date DESC
         LIMIT $2`,
        [userId, limit]
      );

      return result.rows.map(row => ({
        id: row.id,
        externalId: row.external_id,
        source: row.source,
        title: row.title,
        authors: row.authors,
        journal: row.journal,
        publishedDate: new Date(row.published_date),
        abstract: row.abstract,
        url: row.url,
        doi: row.doi,
        summary: row.summary
      }));
    } catch (error) {
      console.error('[ResearchService] Error getting high relevance papers:', error);
      return [];
    }
  }

  /**
   * Mark paper as shared with user
   */
  async markPaperAsShared(userId: string, paperId: string): Promise<void> {
    await query(
      `UPDATE user_research_reviews
       SET shared_via_proactive = TRUE, shared_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND paper_id = $2`,
      [userId, paperId]
    );
  }

  /**
   * Get all research topics
   */
  async getResearchTopics(): Promise<Array<{ id: string; name: string; query: string; lastCheckedAt: Date | null }>> {
    const result = await query('SELECT id, name, query, last_checked_at FROM research_topics ORDER BY name');
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      query: row.query,
      lastCheckedAt: row.last_checked_at
    }));
  }

  /**
   * Update topic last checked timestamp
   */
  async updateTopicLastChecked(topicId: string): Promise<void> {
    await query(
      'UPDATE research_topics SET last_checked_at = NOW(), updated_at = NOW() WHERE id = $1',
      [topicId]
    );
  }
}

export const researchService = new ResearchService();
