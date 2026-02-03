import { SYSTEM_PROMPT, USER_CONTEXT_PROMPT } from '../agent/prompts.js';
import { allTools } from '../agent/tools.js';
import type { BaseMessage } from '@langchain/core/messages';

/**
 * Estimate token count for text (rough approximation: 1 token ≈ 4 characters)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate and log context size for AI calls
 */
export function logContextSize(
  messages: BaseMessage[],
  userContext: { email: string; diagnosisType?: string; diagnosisDate?: string; timezone?: string },
  options: { label?: string; isFirstMessage?: boolean } = {}
): void {
  const { label = 'AI Call', isFirstMessage = true } = options;

  let totalTokens = 0;
  const breakdown: any = {};

  // Count message tokens
  const messageTokens = messages.reduce((sum, msg) =>
    sum + estimateTokens(msg.content as string), 0
  );
  totalTokens += messageTokens;
  breakdown.messages = messageTokens;

  // On first message, system prompts are included
  if (isFirstMessage) {
    const systemPromptTokens = estimateTokens(SYSTEM_PROMPT);
    const userContextTokens = estimateTokens(USER_CONTEXT_PROMPT(userContext));
    totalTokens += systemPromptTokens + userContextTokens;
    breakdown.systemPrompt = systemPromptTokens;
    breakdown.userContext = userContextTokens;
  }

  // Estimate tool definitions size
  const toolsJson = JSON.stringify(allTools.map(t => ({
    name: t.name,
    description: t.description,
    schema: t.schema
  })));
  const toolTokens = estimateTokens(toolsJson);
  totalTokens += toolTokens;
  breakdown.toolDefinitions = toolTokens;

  console.log(`\n📊 ${label} - Context Size:`);
  console.log(`  Total: ~${totalTokens.toLocaleString()} tokens`);
  console.log(`  Breakdown:`, JSON.stringify(breakdown, null, 2));
  console.log();
}
