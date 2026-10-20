/**
 * Width of `chunks.embedding`. SiliconFlow `BAAI/bge-m3` is natively 1024.
 * OpenAI `text-embedding-3-*` is requested with `dimensions: 1024` so it fits
 * the same column. Demo hashes use 1024 too. The spaces are still not
 * interchangeable — the app refuses a model mismatch.
 */
export const EMBEDDING_DIMENSIONS = 1024;

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-flash";
export const DEFAULT_SILICONFLOW_EMBEDDING_MODEL = "BAAI/bge-m3";
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";

/**
 * Character window, not tokens. Offsets are indexes into the stored page
 * string, so the highlight does not depend on a tokenizer. 800 characters is
 * about 200 tokens: usually one or two claims, small enough to point at.
 */
export const CHUNK_SIZE = 800;

/**
 * Overlap keeps a sentence that would otherwise sit on a boundary inside at
 * least one chunk. 120 characters is roughly one sentence of context.
 */
export const CHUNK_OVERLAP = 120;

/** How many passages are numbered in the prompt. Markers outside 1..K are dropped. */
export const TOP_K = 5;

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const DEMO_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

/** Exact refusal. The prompt, the demo answerer, and the validator all share it. */
export const REFUSAL_TEXT =
  "The documents do not contain enough evidence to answer that.";

export const SAMPLE_FILENAME = "harbor-pine-handbook.pdf";

export const SAMPLE_QUESTIONS = [
  "Who founded Harbor & Pine and in what year?",
  "What is the roaster temperature limit?",
  "What is the employee wholesale discount?",
  "What is the company policy on pet insurance?",
];
