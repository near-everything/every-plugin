import { oc } from "@orpc/contract";
import { createConfigSchema, CommonPluginErrors } from "every-plugin";
import { z } from "zod";

// Source item schema that plugins return
const sourceItemSchema = z.object({
  externalId: z.string(),
  content: z.string(),
  contentType: z.string().optional(),
  createdAt: z.string().optional(),
  url: z.string().optional(),
  authors: z.array(z.object({
    id: z.string().optional(),
    username: z.string().optional(),
    displayName: z.string().optional(),
    url: z.string().optional(),
  })).optional(),
  raw: z.unknown(), // Original Masa API response
});

// Masa-specific enums and types
const MasaSourceTypeSchema = z.enum(['twitter-credential', 'twitter-api', 'twitter']);
const MasaSearchMethodSchema = z.enum([
  'searchbyquery',
  'searchbyfullarchive', 
  'getbyid',
  'getreplies',
  'getretweeters',
  'gettweets',
  'getmedia',
  'gethometweets',
  'getforyoutweets',
  'searchbyprofile',
  'getprofilebyid',
  'gettrends',
  'getfollowing',
  'getfollowers',
  'getspace'
]);

// State schema for streaming operations - clean three-phase design
export const stateSchema = z.object({
  phase: z.enum(['initial', 'backfill', 'live']),
  mostRecentId: z.string().optional(), // newest processed id (for live since_id)
  oldestSeenId: z.string().optional(), // oldest processed id (for backfill max_id)
  backfillDone: z.boolean().default(false),
  totalProcessed: z.number().default(0),
  nextPollMs: z.number().nullable().optional(), // For streaming: null = terminate, number = delay
});

// Contract definition for the Masa source plugin
export const masaContract = {
  // Core job operations for async search
  submitSearchJob: oc
    .input(z.object({
      sourceType: MasaSourceTypeSchema.optional().default('twitter'),
      searchMethod: MasaSearchMethodSchema.optional().default('searchbyquery'),
      query: z.string(),
      maxResults: z.number().min(1).optional(),
      nextCursor: z.string().optional(),
    }))
    .output(z.object({
      jobId: z.string()
    }))
    .errors(CommonPluginErrors),

  checkJobStatus: oc
    .input(z.object({
      jobId: z.string(),
    }))
    .output(z.object({
      status: z.enum(['submitted', 'in progress', 'done', 'error'])
    }))
    .errors(CommonPluginErrors),

  getJobResults: oc
    .input(z.object({
      jobId: z.string(),
    }))
    .output(z.object({
      items: z.array(sourceItemSchema)
    }))
    .errors(CommonPluginErrors),

  // Single item fetch by ID
  getById: oc
    .input(z.object({
      id: z.string(),
      sourceType: MasaSourceTypeSchema.optional().default('twitter'),
    }))
    .output(z.object({
      item: sourceItemSchema
    }))
    .errors(CommonPluginErrors),

  // Bulk fetch operation
  getBulk: oc
    .input(z.object({
      ids: z.array(z.string()),
      sourceType: MasaSourceTypeSchema.optional().default('twitter'),
    }))
    .output(z.object({
      items: z.array(sourceItemSchema),
    }))
    .errors(CommonPluginErrors),

  // Instant similarity search (vector-based)
  similaritySearch: oc
    .input(z.object({
      query: z.string(),
      sources: z.array(z.enum(['twitter', 'web', 'tiktok'])).optional(),
      keywords: z.array(z.string()).optional(),
      keywordOperator: z.enum(['and', 'or']).optional().default('and'),
      maxResults: z.number().min(1).max(100).optional().default(10),
    }))
    .output(z.object({
      items: z.array(sourceItemSchema),
    }))
    .errors(CommonPluginErrors),

  // Instant hybrid search (semantic + keyword)
  hybridSearch: oc
    .input(z.object({
      similarityQuery: z.object({
        query: z.string(),
        weight: z.number().min(0).max(1),
      }),
      textQuery: z.object({
        query: z.string(),
        weight: z.number().min(0).max(1),
      }),
      sources: z.array(z.enum(['twitter', 'web', 'tiktok'])).optional(),
      keywords: z.array(z.string()).optional(),
      keywordOperator: z.enum(['and', 'or']).optional().default('and'),
      maxResults: z.number().min(1).max(100).optional().default(10),
    }))
    .output(z.object({
      items: z.array(sourceItemSchema),
    }))
    .errors(CommonPluginErrors),

  // Profile operations
  getProfile: oc
    .input(z.object({
      username: z.string(),
      sourceType: MasaSourceTypeSchema.optional().default('twitter'),
    }))
    .output(z.object({
      profile: z.object({
        id: z.string(),
        username: z.string(),
        displayName: z.string().optional(),
        bio: z.string().optional(),
        followersCount: z.number().optional(),
        followingCount: z.number().optional(),
        tweetsCount: z.number().optional(),
        verified: z.boolean().optional(),
        profileImageUrl: z.string().optional(),
        raw: z.unknown(),
      })
    }))
    .errors(CommonPluginErrors),

  // Get trending topics
  getTrends: oc
    .input(z.object({
      sourceType: MasaSourceTypeSchema.optional().default('twitter'),
    }))
    .output(z.object({
      trends: z.array(z.object({
        name: z.string(),
        query: z.string().optional(),
        tweetVolume: z.number().optional(),
        raw: z.unknown(),
      }))
    }))
    .errors(CommonPluginErrors),

  search: oc
    .input(z.object({
      query: z.string(),
      maxResults: z.number().min(1).optional(),
      budgetMs: z.number().min(5000).max(300000).optional().default(60000),
      sourceType: MasaSourceTypeSchema.optional().default('twitter'),
      searchMethod: MasaSearchMethodSchema.optional().default('searchbyquery'),
      livePollMs: z.number().min(1000).max(3600000).optional().default(60000), // 1 second, 1 minute default
      backfillPageSize: z.number().min(1).max(500).optional().default(100),
      livePageSize: z.number().min(1).max(100).optional().default(50),
    }))
    .output(z.object({
      items: z.array(sourceItemSchema),
      nextState: stateSchema
    }))
    .errors(CommonPluginErrors).meta({ "streamable": "true" }) 
};

// Export types for use in implementation
export type MasaContract = typeof masaContract;
export type SourceItem = z.infer<typeof sourceItemSchema>;
export type MasaSourceType = z.infer<typeof MasaSourceTypeSchema>;
export type MasaSearchMethod = z.infer<typeof MasaSearchMethodSchema>;
export type StreamState = z.infer<typeof stateSchema>;

// Config schema with variables and secrets
export const MasaSourceConfigSchema = createConfigSchema(
  // Variables (non-sensitive config)
  z.object({
    baseUrl: z.url().optional().default("https://data.masa.ai/api/v1"),
    timeout: z.number().optional().default(30000),
    defaultMaxResults: z.number().min(1).max(500).optional().default(10),
  }),
  // Secrets (sensitive config, hydrated at runtime)
  z.object({
    apiKey: z.string().min(1, "Masa API key is required"),
  }),
);

// Derived types
export type MasaSourceConfig = z.infer<typeof MasaSourceConfigSchema>;
