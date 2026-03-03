// Configuración de proveedor y API key
const PRIME_PROVIDER = (process.env.PRIME_PROVIDER ?? "mock") as "openai" | "mock";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
export const PRIME_MODEL = process.env.PRIME_MODEL || "gpt-3.5-turbo-1106";
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-ada-002";
export const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM) || 1536;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fallback helpers determinísticos
function fallbackSummary(content: string): string {
  // Resumen simple: primeras 320 chars o hasta el primer punto
  const firstDot = content.indexOf('.') !== -1 ? content.indexOf('.') + 1 : 320;
  return content.slice(0, Math.min(320, firstDot)).trim();
}

function fallbackEmotion(content: string): string {
  // Etiquetas simples, no clínicas
  const tags = ["calma", "nostalgia", "tensión", "alegría", "tristeza", "esperanza", "gratitud", "asombro"];
  const lowered = content.toLowerCase();
  if (lowered.includes("feliz") || lowered.includes("alegr")) return "alegría";
  if (lowered.includes("triste") || lowered.includes("llor")) return "tristeza";
  if (lowered.includes("gracias") || lowered.includes("gratitud")) return "gratitud";
  if (lowered.includes("calma") || lowered.includes("tranquil")) return "calma";
  if (lowered.includes("nostalg")) return "nostalgia";
  if (lowered.includes("tenso") || lowered.includes("preocup")) return "tensión";
  if (lowered.includes("esperanza")) return "esperanza";
  if (lowered.includes("sorprend")) return "asombro";
  return tags[Math.floor(Math.random() * tags.length)];
}

function fallbackTopics(content: string): string[] {
  // Extrae palabras clave simples, sin stopwords
  const stopwords = ["el","la","los","las","de","y","a","en","que","un","una","es","con","por","para","mi","me","se","al","del","lo","le","su","sus","o","pero","como","más","ya","muy","sin","sobre","también","fue","ha","son","si","no","sí"];
  const words = content.toLowerCase().replace(/[^a-záéíóúñü\s]/gi, '').split(/\s+/);
  const freq: Record<string, number> = {};
  for (const w of words) {
    if (w.length > 3 && !stopwords.includes(w)) freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);
}

function fallbackQuestion(destiny: string | undefined, emotion: string): string {
  // Pregunta suave, no clínica
  if (destiny === "kids") return `¿Qué te gustaría que tus hijos recuerden de este momento de ${emotion}?`;
  if (destiny === "partner") return `¿Cómo te gustaría compartir esta emoción de ${emotion} con tu pareja?`;
  if (destiny === "someone_lost") return `¿Qué mensaje dejarías a quien ya no está sobre este sentimiento de ${emotion}?`;
  return `¿Qué aprendizaje o reflexión te deja esta experiencia de ${emotion}?`;
}
// src/server/lib/prime/index.ts
import { performance } from 'perf_hooks';
import { db } from '../../db.js';
import { getMonthKey, ensureBudgetRow, reserveBudget, recordBudgetEvent } from './budget.js';
import { estimateUsdCost } from './cost.js';

export async function primeAnalyze({ content, destiny }: { content: string; destiny: string }) {
  const t0 = performance.now();
  const monthKey = getMonthKey();
  const budgetLimit = parseFloat(process.env.PRIME_BUDGET_LIMIT_USD || '5');
  const budgetMode = process.env.PRIME_BUDGET_MODE || 'hard';
  const budgetEnabled = process.env.PRIME_BUDGET_ENABLED === 'true';
  await ensureBudgetRow(db, monthKey, budgetLimit);
  // Estimar tokens
  const inputTokens = Math.ceil(content.length / 4);
  const outputTokens = 200;
  const estimatedUsd = estimateUsdCost({ inputTokens, outputTokens, type: 'prime' });
  let allowed = true;
  if (budgetEnabled && PRIME_PROVIDER === 'openai' && OPENAI_API_KEY) {
    const res = await reserveBudget(db, monthKey, estimatedUsd, budgetMode as 'hard');
    allowed = res.allowed;
    if (!allowed) {
      await recordBudgetEvent(db, 'system', {
        event: 'llm_budget_blocked',
        month: monthKey,
        estimatedUsd,
        provider: 'fallback',
      });
      return {
        summary: fallbackSummary(content),
        emotion: fallbackEmotion(content),
        topics: fallbackTopics(content),
        question: fallbackQuestion(destiny, fallbackEmotion(content)),
        provider: 'fallback',
        latency_ms: Math.round(performance.now() - t0),
        usage: { budget_month: monthKey, estimated_usd: estimatedUsd },
      };
    }
  }
  if (PRIME_PROVIDER !== 'openai' || !OPENAI_API_KEY) {
    // Fallback/mock
    return {
      summary: fallbackSummary(content),
      emotion: fallbackEmotion(content),
      topics: fallbackTopics(content),
      question: fallbackQuestion(destiny, fallbackEmotion(content)),
      provider: PRIME_PROVIDER === 'mock' ? 'mock' : 'fallback',
      latency_ms: Math.round(performance.now() - t0),
      usage: { budget_month: monthKey, estimated_usd: estimatedUsd },
    };
  }
  // OpenAI Structured Output
  // (schema eliminado, no usado)
  const prompt = `Resume y etiqueta el siguiente texto según reglas PRIME. No inventes hechos. Tono sobrio, íntimo, respetuoso. Salida JSON exacta:
{
  "summary": string (<= 320 chars),
  "emotion": string (1 etiqueta),
  "topics": string[] (max 8),
  "question": string (<= 140 chars)
}
Texto:
"""
${content}
"""
Destino: ${destiny}`;
  let retries = 0;
  while (retries < 3) {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: PRIME_MODEL,
          messages: [
            { role: 'system', content: 'Eres un asistente PRIME. Solo responde en JSON.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 512,
        }),
      });
      if (!resp.ok) {
        if ([429,500,502,503,504].includes(resp.status)) {
          await sleep([300,900,2000][retries] || 900);
          retries++;
          continue;
        }
        throw new Error(`OpenAI error: ${resp.status}`);
      }
      const json = await resp.json();
      const usage = json.usage || {};
      let parsed;
      try {
        parsed = typeof json.choices?.[0]?.message?.content === 'string'
          ? JSON.parse(json.choices[0].message.content)
          : json.choices[0].message.content;
      } catch {
        throw new Error('No se pudo parsear JSON PRIME');
      }
      // Calcular costo real
      let realUsd = estimatedUsd;
      if (usage?.total_tokens) {
        const realInput = usage.prompt_tokens || inputTokens;
        const realOutput = usage.completion_tokens || outputTokens;
        realUsd = estimateUsdCost({ inputTokens: realInput, outputTokens: realOutput, type: 'prime' });
        if (realUsd > estimatedUsd && budgetEnabled) {
          await reserveBudget(db, monthKey, realUsd - estimatedUsd, budgetMode as 'hard');
        }
      }
      await recordBudgetEvent(db, 'system', {
        event: 'llm_budget_spend',
        month: monthKey,
        estimatedUsd,
        realUsd,
        usage,
        provider: 'openai',
      });
      return {
        ...parsed,
        provider: 'openai',
        usage: { budget_month: monthKey, estimated_usd: estimatedUsd, real_usd: realUsd, usage },
        latency_ms: Math.round(performance.now() - t0),
      };
    } catch {
      retries++;
      if (retries >= 3) {
        // Fallback por error
        await recordBudgetEvent(db, 'system', {
          event: 'llm_budget_blocked',
          month: monthKey,
          estimatedUsd,
          provider: 'fallback_error',
        });
        return {
          summary: fallbackSummary(content),
          emotion: fallbackEmotion(content),
          topics: fallbackTopics(content),
          question: fallbackQuestion(destiny, fallbackEmotion(content)),
          provider: 'fallback_error',
          latency_ms: Math.round(performance.now() - t0),
          usage: { budget_month: monthKey, estimated_usd: estimatedUsd },
        };
      }
    }
  }
}

export async function embedText(text: string): Promise<{ vector: number[]; provider: "openai"|"fallback"|"mock"; usage?: unknown; latency_ms: number; }> {
  const t0 = performance.now();
  const monthKey = getMonthKey();
  const budgetLimit = parseFloat(process.env.PRIME_BUDGET_LIMIT_USD || '5');
  const budgetMode = process.env.PRIME_BUDGET_MODE || 'hard';
  const budgetEnabled = process.env.PRIME_BUDGET_ENABLED === 'true';
  await ensureBudgetRow(db, monthKey, budgetLimit);
  const inputTokens = Math.ceil(text.length / 4);
  const estimatedUsd = estimateUsdCost({ inputTokens, type: 'embedding' });
  let allowed = true;
  if (budgetEnabled && PRIME_PROVIDER === 'openai' && OPENAI_API_KEY) {
    const res = await reserveBudget(db, monthKey, estimatedUsd, budgetMode as 'hard');
    allowed = res.allowed;
    if (!allowed) {
      await recordBudgetEvent(db, 'system', {
        event: 'llm_budget_blocked',
        month: monthKey,
        estimatedUsd,
        provider: 'fallback',
      });
      return {
        vector: Array(EMBEDDING_DIM).fill(0).map((_, i) => Math.sin(i + text.length)),
        provider: 'fallback',
        latency_ms: Math.round(performance.now() - t0),
        usage: { budget_month: monthKey, estimated_usd: estimatedUsd },
      };
    }
  }
  if (PRIME_PROVIDER !== 'openai' || !OPENAI_API_KEY) {
    // Fallback/mock
    return {
      vector: Array(EMBEDDING_DIM).fill(0).map((_, i) => Math.sin(i + text.length)),
      provider: PRIME_PROVIDER === 'mock' ? 'mock' : 'fallback',
      latency_ms: Math.round(performance.now() - t0),
      usage: { budget_month: monthKey, estimated_usd: estimatedUsd },
    };
  }
  let retries = 0;
  while (retries < 3) {
    try {
      const resp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: text,
          encoding_format: 'float',
          dimensions: EMBEDDING_DIM,
        }),
      });
      if (!resp.ok) {
        if ([429,500,502,503,504].includes(resp.status)) {
          await sleep([300,900,2000][retries] || 900);
          retries++;
          continue;
        }
        throw new Error(`OpenAI error: ${resp.status}`);
      }
      const json = await resp.json();
      const usage = json.usage || {};
      const vector = json.data?.[0]?.embedding;
      if (!vector || !Array.isArray(vector)) throw new Error('No embedding');
      let realUsd = estimatedUsd;
      if (usage?.total_tokens) {
        const realInput = usage.total_tokens || inputTokens;
        realUsd = estimateUsdCost({ inputTokens: realInput, type: 'embedding' });
        if (realUsd > estimatedUsd && budgetEnabled) {
          await reserveBudget(db, monthKey, realUsd - estimatedUsd, budgetMode as 'hard');
        }
      }
      await recordBudgetEvent(db, 'system', {
        event: 'llm_budget_spend',
        month: monthKey,
        estimatedUsd,
        realUsd,
        usage,
        provider: 'openai',
      });
      return {
        vector,
        provider: 'openai',
        usage: { budget_month: monthKey, estimated_usd: estimatedUsd, real_usd: realUsd, usage },
        latency_ms: Math.round(performance.now() - t0),
      };
    } catch {
      retries++;
      if (retries >= 3) break;
    }
  }
  // Fallback por error
  await recordBudgetEvent(db, 'system', {
    event: 'llm_budget_blocked',
    month: monthKey,
    estimatedUsd,
    provider: 'fallback',
  });
  return {
    vector: Array(EMBEDDING_DIM).fill(0).map((_, i) => Math.sin(i + text.length)),
    provider: 'fallback',
    latency_ms: Math.round(performance.now() - t0),
    usage: { budget_month: monthKey, estimated_usd: estimatedUsd },
  };
}
