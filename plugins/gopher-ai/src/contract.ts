import { CommonPluginErrors } from "every-plugin";
import { eventIterator, oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

export const GopherResultSchema = z.object({
  id: z.string(),
  source: z.enum(['twitter', 'tiktok', 'reddit', 'web']),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  updated_at: z.string().optional(),
}).catchall(z.any()); // Allow ALL additional fields from Gopher AI sources

export const SourceTypeSchema = z.enum(['twitter', 'tiktok', 'reddit']);
export const SearchMethodSchema = z.enum([
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

export const contract = oc.router({
  submitSearchJob: oc
    .route({ method: 'POST', path: '/jobs' })
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
    .route({ method: 'GET', path: '/jobs/{jobId}/status' })
    .input(z.object({
      jobId: z.string(),
    }))
    .output(z.object({
      status: z.enum(['submitted', 'in progress', 'done', 'error'])
    }))
    .errors(CommonPluginErrors),

  getJobResults: oc
    .route({ method: 'GET', path: '/jobs/{jobId}/results' })
    .input(z.object({
      jobId: z.string(),
    }))
    .output(z.object({
      items: z.array(GopherResultSchema)
    }))
    .errors(CommonPluginErrors),

  getById: oc
    .route({ method: 'GET', path: '/items/{id}' })
    .input(z.object({
      id: z.string(),
      sourceType: SourceTypeSchema.optional().default('twitter'),
    }))
    .output(z.object({
      item: GopherResultSchema
    }))
    .errors(CommonPluginErrors),

  getBulk: oc
    .route({ method: 'POST', path: '/items/bulk' })
    .input(z.object({
      ids: z.array(z.string()),
      sourceType: SourceTypeSchema.optional().default('twitter'),
    }))
    .output(z.object({
      items: z.array(GopherResultSchema),
    }))
    .errors(CommonPluginErrors),

  getReplies: oc
    .route({ method: 'GET', path: '/conversations/{conversationId}/replies' })
    .input(z.object({
      conversationId: z.string(),
      sourceType: SourceTypeSchema.optional().default('twitter'),
      maxResults: z.number().min(1).max(100).optional().default(20),
    }))
    .output(z.object({
      replies: z.array(GopherResultSchema),
    }))
    .errors(CommonPluginErrors),

  similaritySearch: oc
    .route({ method: 'POST', path: '/search/similarity' })
    .input(z.object({
      query: z.string(),
      sources: z.array(SourceTypeSchema).optional(),
      keywords: z.array(z.string()).optional(),
      keywordOperator: z.enum(['and', 'or']).optional().default('and'),
      maxResults: z.number().min(1).max(100).optional().default(10),
    }))
    .output(z.object({
      items: z.array(GopherResultSchema),
    }))
    .errors(CommonPluginErrors),

  hybridSearch: oc
    .route({ method: 'POST', path: '/search/hybrid' })
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
      items: z.array(GopherResultSchema),
    }))
    .errors(CommonPluginErrors),

  getProfile: oc
    .route({ method: 'GET', path: '/profiles/{username}' })
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

  getTrends: oc
    .route({ method: 'GET', path: '/trends' })
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

  search: oc
    .route({ method: 'POST', path: '/search' })
    .input(z.object({
      query: z.string(),
      sourceType: SourceTypeSchema.optional().default('twitter'),
      sinceId: z.string().optional(),
      maxId: z.string().optional(),
      maxBackfillResults: z.number().optional(),
      oldestAllowedId: z.string().optional(),
      maxBackfillAgeMs: z.number().optional(),
      enableLive: z.boolean().default(true),
      livePollMs: z.number().min(1000).max(3600000).optional().default(60000),
      maxTotalResults: z.number().optional(),
      backfillPageSize: z.number().min(1).max(100).optional().default(100),
      livePageSize: z.number().min(1).max(100).optional().default(20),
    }))
    .output(eventIterator(GopherResultSchema))
    .errors(CommonPluginErrors),

  backfill: oc
    .route({ method: 'POST', path: '/backfill' })
    .input(z.object({
      query: z.string(),
      sourceType: SourceTypeSchema.optional().default('twitter'),
      searchMethod: SearchMethodSchema.optional().default('searchbyfullarchive'),
      maxId: z.string().optional(),
      maxResults: z.number().min(1).optional(),
      pageSize: z.number().min(1).max(100).optional().default(100),
    }))
    .output(eventIterator(GopherResultSchema))
    .errors(CommonPluginErrors),

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
    .output(eventIterator(GopherResultSchema))
    .errors(CommonPluginErrors),
});

export type GopherResult = z.infer<typeof GopherResultSchema>;
export type SourceType = z.infer<typeof SourceTypeSchema>;
export type SearchMethod = z.infer<typeof SearchMethodSchema>;
