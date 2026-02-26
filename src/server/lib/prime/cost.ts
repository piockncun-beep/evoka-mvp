// src/server/lib/prime/cost.ts
export function estimateUsdCost({ inputTokens, outputTokens, type }: { inputTokens: number; outputTokens?: number; type: 'prime'|'embedding'; }) {
  const inputRate = parseFloat(process.env.PRIME_INPUT_USD_PER_1K || '0.0005');
  const outputRate = parseFloat(process.env.PRIME_OUTPUT_USD_PER_1K || '0.0015');
  const embeddingRate = parseFloat(process.env.EMBEDDING_USD_PER_1K || '0.00002');
  if (type === 'prime') {
    return ((inputTokens/1000)*inputRate) + ((outputTokens||0)/1000)*outputRate;
  }
  if (type === 'embedding') {
    return (inputTokens/1000)*embeddingRate;
  }
  return 0;
}
