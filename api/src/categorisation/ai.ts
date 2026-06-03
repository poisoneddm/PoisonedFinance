import OpenAI from 'openai';
import { pool } from '@/db/client';
import type { TxnForCategorisation, CategorizationResult } from './types';

const MODEL = 'llama-3.3-70b-versatile';
const CHUNK_SIZE = 40;

async function getCategoryNames(): Promise<string[]> {
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM categories ORDER BY name');
  return rows.map(r => r.name);
}

async function categoriseChunk(
  client: OpenAI,
  chunk: TxnForCategorisation[],
  categoryNames: string[],
): Promise<CategorizationResult[]> {
  const response = await client.chat.completions.create({
    model: MODEL,
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
    tools: [
      {
        type: 'function',
        function: {
          name: 'categorise_transactions',
          description: 'Categorise UK bank transactions into the provided categories.',
          parameters: {
            type: 'object',
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
      },
    ],
    tool_choice: { type: 'function', function: { name: 'categorise_transactions' } },
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error('AI did not return a tool call');

  const { results } = JSON.parse(toolCall.function.arguments) as { results: Array<{ id: string; category: string }> };
  return results.map(r => ({ id: r.id, category_name: r.category, source: 'ai' as const }));
}

export async function batchCategorise(
  transactions: TxnForCategorisation[],
): Promise<CategorizationResult[]> {
  if (transactions.length === 0) return [];

  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
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
