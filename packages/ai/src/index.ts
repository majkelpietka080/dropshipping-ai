import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });
import Anthropic from '@anthropic-ai/sdk';

export type AgentProposal = {
  id: string;
  agent: string;
  action: string;
  reason: string;
  payload: unknown;
  requiresApproval: boolean;
};

export function createClaudeClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export async function askClaude(prompt: string) {
  const client = createClaudeClient();
  const response = await client.messages.create({
    model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  });
  return response.content.filter((block) => block.type === 'text').map((block) => block.text).join('\\n');
}
