import { oc } from "@orpc/contract";
import { CommonPluginErrors } from "every-plugin";
import { eventIterator } from "every-plugin/orpc";
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
  raw: z.unknown(),
});

const SourceTypeSchema = z.enum(['twitter', 'tiktok', 'reddit']);
const SearchMethodSchema = z.enum([
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

export const contract = {
  // Core job operations for async search
  submitSearchJob: oc
    .input(z.object({
      sourceType: SourceTypeSchema.optional().default('twitter'),
      searchMethod: SearchMethodSchema.optional().default('searchbyquery'),
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
      sourceType: SourceTypeSchema.optional().default('twitter'),
    }))
    .output(z.object({
      item: sourceItemSchema
    }))
    .errors(CommonPluginErrors),

  // Bulk fetch operation
  getBulk: oc
    .input(z.object({
      ids: z.array(z.string()),
      sourceType: SourceTypeSchema.optional().default('twitter'),
    }))
    .output(z.object({
      items: z.array(sourceItemSchema),
    }))
    .errors(CommonPluginErrors),

  // Get replies to a specific tweet/conversation
  getReplies: oc
    .input(z.object({
      conversationId: z.string(),
      sourceType: SourceTypeSchema.optional().default('twitter'),
      maxResults: z.number().min(1).max(100).optional().default(20),
    }))
    .output(z.object({
      replies: z.array(sourceItemSchema),
    }))
    .errors(CommonPluginErrors),

  // Instant similarity search (vector-based)
  similaritySearch: oc
    .input(z.object({
      query: z.string(),
      sources: z.array(SourceTypeSchema).optional(),
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
      sources: z.array(SourceTypeSchema).optional(),
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
      sourceType: SourceTypeSchema.optional().default('twitter'),
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
      sourceType: SourceTypeSchema.optional().default('twitter'),
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

  // Unified search stream (backfill → gap detection → live)
  search: oc
    .route({ method: 'POST', path: '/search' })
    .input(z.object({
      query: z.string(),
      sourceType: SourceTypeSchema.optional().default('twitter'),
      searchMethod: SearchMethodSchema.optional().default('searchbyquery'),

      // Resumption cursors (state - changes on resume)
      sinceId: z.string().optional(),
      maxId: z.string().optional(),

      // Backfill limits (config - constant on resume)
      maxBackfillResults: z.number().optional(),
      oldestAllowedId: z.string().optional(),
      maxBackfillAgeMs: z.number().optional(),

      // Live mode control
      enableLive: z.boolean().default(true),
      livePollMs: z.number().min(1000).max(3600000).optional().default(60000),

      // Hard limits
      maxTotalResults: z.number().optional(),

      // Page sizes
      backfillPageSize: z.number().min(1).max(100).optional().default(100),
      livePageSize: z.number().min(1).max(100).optional().default(20),
    }))
    .output(eventIterator(sourceItemSchema))
    .errors(CommonPluginErrors),

  // Backfill only stream (finite)
  backfill: oc
    .route({ method: 'POST', path: '/backfill' })
    .input(z.object({
      query: z.string(),
      sourceType: SourceTypeSchema.optional().default('twitter'),
      searchMethod: SearchMethodSchema.optional().default('searchbyquery'),
      maxId: z.string().optional(),
      maxResults: z.number().min(1).optional(),
      pageSize: z.number().min(1).max(100).optional().default(100),
    }))
    .output(eventIterator(sourceItemSchema))
    .errors(CommonPluginErrors),

  // Live polling only stream (infinite)
  live: oc
    .route({ method: 'POST', path: '/live' })
    .input(z.object({
      query: z.string(),
      sourceType: SourceTypeSchema.optional().default('twitter'),
      searchMethod: SearchMethodSchema.optional().default('searchbyquery'),
      sinceId: z.string().optional(),
      pollMs: z.number().min(1000).max(3600000).optional().default(60000),
      pageSize: z.number().min(1).max(100).optional().default(20),
    }))
    .output(eventIterator(sourceItemSchema))
    .errors(CommonPluginErrors),
};

// Export types for use in implementation
export type SourceItem = z.infer<typeof sourceItemSchema>;
export type SourceType = z.infer<typeof SourceTypeSchema>;
export type SearchMethod = z.infer<typeof SearchMethodSchema>;
