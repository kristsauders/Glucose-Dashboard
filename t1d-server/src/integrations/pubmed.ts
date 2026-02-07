import { parseStringPromise } from 'xml2js';

/**
 * PubMed E-utilities API integration (free, no API key required)
 * https://www.ncbi.nlm.nih.gov/books/NBK25501/
 */

export interface PubMedPaper {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  publishedDate: Date;
  abstract: string;
  doi?: string;
  url: string;
}

export class PubMedService {
  private baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  private email = 'sage@example.com'; // Polite to include email for NCBI

  /**
   * Fetch with retry logic and exponential backoff for rate limiting
   */
  private async fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url);

        // If rate limited, wait and retry
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const waitTime = retryAfter
            ? parseInt(retryAfter) * 1000
            : Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s

          console.log(`[PubMed] Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        return response;
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 1000;
          console.log(`[PubMed] Request failed, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Search PubMed for papers matching query
   */
  async searchPapers(
    query: string,
    maxResults: number = 10,
    startYear?: number
  ): Promise<PubMedPaper[]> {
    try {
      console.log(`[PubMed] Searching for: "${query}" (max ${maxResults} results)`);

      // Add date filter if startYear provided
      let searchQuery = query;
      if (startYear) {
        const currentYear = new Date().getFullYear();
        searchQuery += ` AND ${startYear}:${currentYear}[pdat]`;
      }

      // Step 1: Search for PubMed IDs
      const ids = await this.searchIds(searchQuery, maxResults);

      if (ids.length === 0) {
        console.log('[PubMed] No results found');
        return [];
      }

      console.log(`[PubMed] Found ${ids.length} papers`);

      // Step 2: Fetch detailed information for IDs
      const papers = await this.fetchDetails(ids);

      return papers;
    } catch (error) {
      console.error('[PubMed] Search error:', error);
      throw new Error(`PubMed search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search for PubMed IDs matching query
   */
  private async searchIds(query: string, maxResults: number): Promise<string[]> {
    const params = new URLSearchParams({
      db: 'pubmed',
      term: query,
      retmax: maxResults.toString(),
      retmode: 'json',
      sort: 'relevance',
      tool: 'sage_diabetes_assistant',
      email: this.email
    });

    const url = `${this.baseUrl}/esearch.fcgi?${params.toString()}`;
    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      throw new Error(`PubMed API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.esearchresult?.idlist || [];
  }

  /**
   * Fetch detailed information for PubMed IDs
   */
  private async fetchDetails(ids: string[]): Promise<PubMedPaper[]> {
    const params = new URLSearchParams({
      db: 'pubmed',
      id: ids.join(','),
      retmode: 'xml',
      tool: 'sage_diabetes_assistant',
      email: this.email
    });

    const url = `${this.baseUrl}/efetch.fcgi?${params.toString()}`;
    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      throw new Error(`PubMed API error: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    return this.parseXML(xml);
  }

  /**
   * Parse PubMed XML response into structured data
   */
  private async parseXML(xml: string): Promise<PubMedPaper[]> {
    try {
      const result = await parseStringPromise(xml);
      const articles = result?.PubmedArticleSet?.PubmedArticle || [];

      return articles.map((article: any) => this.extractPaperData(article)).filter(Boolean);
    } catch (error) {
      console.error('[PubMed] XML parsing error:', error);
      return [];
    }
  }

  /**
   * Extract paper data from parsed XML
   */
  private extractPaperData(article: any): PubMedPaper | null {
    try {
      const medlineCitation = article.MedlineCitation?.[0];
      const pubmedData = article.PubmedData?.[0];

      if (!medlineCitation) return null;

      const articleData = medlineCitation.Article?.[0];
      if (!articleData) return null;

      // Extract PMID
      const pmid = medlineCitation.PMID?.[0]?._ || medlineCitation.PMID?.[0];

      // Extract title
      const title = articleData.ArticleTitle?.[0] || '';

      // Extract authors
      const authorList = articleData.AuthorList?.[0]?.Author || [];
      const authors = authorList.map((author: any) => {
        const lastName = author.LastName?.[0] || '';
        const foreName = author.ForeName?.[0] || '';
        return `${foreName} ${lastName}`.trim();
      }).filter(Boolean);

      // Extract journal
      const journal = articleData.Journal?.[0]?.Title?.[0] || '';

      // Extract publication date
      const pubDate = articleData.Journal?.[0]?.JournalIssue?.[0]?.PubDate?.[0];
      const year = pubDate?.Year?.[0] || new Date().getFullYear();
      const month = pubDate?.Month?.[0] || '01';
      const day = pubDate?.Day?.[0] || '01';
      const publishedDate = new Date(`${year}-${month}-${day}`);

      // Extract abstract
      const abstractText = articleData.Abstract?.[0]?.AbstractText || [];
      const abstract = abstractText.map((text: any) => {
        if (typeof text === 'string') return text;
        if (text._) return text._;
        return '';
      }).join(' ');

      // Extract DOI
      const articleIds = pubmedData?.ArticleIdList?.[0]?.ArticleId || [];
      const doiObj = articleIds.find((id: any) => id.$?.IdType === 'doi');
      const doi = doiObj?._ || doiObj || undefined;

      // Construct URL
      const url = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

      return {
        pmid,
        title,
        authors,
        journal,
        publishedDate,
        abstract,
        doi,
        url
      };
    } catch (error) {
      console.error('[PubMed] Error extracting paper data:', error);
      return null;
    }
  }

  /**
   * Get a specific paper by PMID
   */
  async getPaperByPMID(pmid: string): Promise<PubMedPaper | null> {
    try {
      const papers = await this.fetchDetails([pmid]);
      return papers[0] || null;
    } catch (error) {
      console.error(`[PubMed] Error fetching paper ${pmid}:`, error);
      return null;
    }
  }
}

// Singleton instance
export const pubmedService = new PubMedService();
