import Anthropic from '@anthropic-ai/sdk';
import { pool } from '@/db/client';
import type { TxnForCategorisation, CategorizationResult } from './types';

const MODEL = 'claude-sonnet-4-6';
const CHUNK_SIZE = 40;

async function getCategoryNames(): Promise<string[]> {
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM categories ORDER BY name');
  return rows.map(r => r.name);
}

async function categoriseChunk(
  client: Anthropic,
  chunk: TxnForCategorisation[],
  categoryNames: string[],
): Promise<CategorizationResult[]> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [
      {
        name: 'categorise_transactions',
        description: 'Categorise UK bank transactions into the provided categories.',
        input_schema: {
          type: 'object' as const,
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  category: { type: 'string', enum: categoryNames },
                },
                required: ['id', 'category'],
              },
            },
          },
          required: ['results'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'categorise_transactions' },
    messages: [
      {
        role: 'user',
        content: `Categorise these UK bank transactions. Use the merchant name where available, otherwise the description.\n\n${JSON.stringify(
          chunk.map(t => ({ id: t.id, merchant: t.merchant_name ?? t.description })),
          null,
          2,
        )}`,
      },
    ],
  });

  const toolUse = message.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Claude did not return tool_use');

  const { results } = toolUse.input as { results: Array<{ id: string; category: string }> };
  return results.map(r => ({ id: r.id, category_name: r.category, source: 'ai' as const }));
}

export async function batchCategorise(
  transactions: TxnForCategorisation[],
): Promise<CategorizationResult[]> {
  if (transactions.length === 0) return [];

  const client = new Anthropic();
  const categoryNames = await getCategoryNames();
  const allResults: CategorizationResult[] = [];

  for (let i = 0; i < transactions.length; i += CHUNK_SIZE) {
    const chunk = transactions.slice(i, i + CHUNK_SIZE);
    try {
      const chunkResults = await categoriseChunk(client, chunk, categoryNames);
      allResults.push(...chunkResults);
    } catch {
      // Failed chunk: transactions remain category_id NULL, needs_review TRUE
    }
  }

  return allResults;
}
