import { env, pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";
import { Context, Effect, Layer } from "effect";

// Disable remote model downloads, use local cache only
env.allowLocalModels = false;
env.allowRemoteModels = true;

export interface EmbeddingsService {
  generateEmbedding: (text: string) => Effect.Effect<Float32Array, Error>;
  generateBatchEmbeddings: (texts: string[]) => Effect.Effect<Float32Array[], Error>;
}

export const EmbeddingsService = Context.GenericTag<EmbeddingsService>("EmbeddingsService");

// Lazy-loaded pipeline instance
let pipelineInstance: FeatureExtractionPipeline | null = null;

const loadPipeline = async (): Promise<FeatureExtractionPipeline> => {
  if (!pipelineInstance) {
    console.log('[Embeddings] Loading all-MiniLM-L6-v2 model...');
    pipelineInstance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('[Embeddings] Model loaded successfully');
  }
  return pipelineInstance;
};

const normalizeText = (text: string): string => {
  return text
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s\.,!?-]/g, '') // Remove special characters except basic punctuation
    .trim()
    .slice(0, 512); // Limit text length for performance
};

// Convert tensor output to Float32Array
const tensorToFloat32Array = (tensor: any): Float32Array => {
  if (tensor.data && typeof tensor.data === 'object' && tensor.data.constructor === Float32Array) {
    return tensor.data;
  }

  // Handle different tensor formats
  if (Array.isArray(tensor)) {
    return new Float32Array(tensor);
  }

  if (tensor.tolist) {
    const list = tensor.tolist();
    return new Float32Array(Array.isArray(list[0]) ? list[0] : list);
  }

  throw new Error('Unexpected tensor format');
};

export const EmbeddingsServiceLive = Layer.effect(
  EmbeddingsService,
  Effect.gen(function* () {
    return {
      generateEmbedding: (text: string) =>
        Effect.tryPromise({
          try: async () => {
            const normalizedText = normalizeText(text);

            if (normalizedText.length === 0) {
              throw new Error('Text is empty after normalization');
            }

            const pipe = await loadPipeline();
            const result = await pipe(normalizedText, {
              pooling: 'mean',
              normalize: true,
            });

            const embedding = tensorToFloat32Array(result);

            if (embedding.length !== 384) {
              throw new Error(`Expected 384 dimensions, got ${embedding.length}`);
            }

            return embedding;
          },
          catch: (error) => new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`)
        }),

      generateBatchEmbeddings: (texts: string[]) =>
        Effect.tryPromise({
          try: async (): Promise<Float32Array[]> => {
            if (texts.length === 0) {
              return [];
            }

            const normalizedTexts = texts.map(normalizeText).filter(text => text.length > 0);

            if (normalizedTexts.length === 0) {
              throw new Error('All texts are empty after normalization');
            }

            const pipe = await loadPipeline();

            const embeddings: Float32Array[] = [];

            // Process in batches of 10 for memory efficiency
            const batchSize = 10;
            for (let i = 0; i < normalizedTexts.length; i += batchSize) {
              const batch = normalizedTexts.slice(i, i + batchSize);

              const batchResults = await Promise.all(
                batch.map(async (text) => {
                  const result = await pipe(text, {
                    pooling: 'mean',
                    normalize: true,
                  });
                  return tensorToFloat32Array(result);
                })
              );

              embeddings.push(...batchResults);
            }

            return embeddings;
          },
          catch: (error) => new Error(`Failed to generate batch embeddings: ${error instanceof Error ? error.message : String(error)}`)
        })
    };
  })
);
