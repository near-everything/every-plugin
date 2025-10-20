import { CommonPluginErrors } from "every-plugin";
import { eventIterator, oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

// Schema for the data items this plugin provides
export const ItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string().datetime(),
});

// Schema for search results
export const SearchResultSchema = z.object({
  item: ItemSchema,
  score: z.number().min(0).max(1),
});

// Schema for background broadcast events (MemoryPublisher)
export const BackgroundEventSchema = z.object({
  id: z.string(),
  index: z.number(),
  timestamp: z.number(),
});

// oRPC Contract definition
export const contract = oc.router({
  // Single item lookup by ID
  getById: oc
    .route({ method: 'GET', path: '/items/{id}' })
    .input(z.object({
      id: z.string().min(1, "ID is required"),
    }))
    .output(z.object({
      item: ItemSchema,
    }))
    .errors(CommonPluginErrors),

  // Search with server-side streaming
  search: oc
    .route({ method: 'GET', path: '/search' })
    .input(z.object({
      query: z.string().min(1, "Query is required"),
      limit: z.number().min(1).max(100).default(10),
    }))
    .output(eventIterator(SearchResultSchema)) // Notice "eventIterator", this enables streaming
    .errors(CommonPluginErrors),

  // Health check procedure
  ping: oc
    .route({ method: 'GET', path: '/ping' })
    .output(z.object({
      status: z.literal('ok'),
      timestamp: z.string().datetime(),
    }))
    .errors(CommonPluginErrors),

  // Background streaming with resume support (MemoryPublisher)
  listenBackground: oc
    .route({ method: 'POST', path: '/listenBackground' })
    .input(z.object({
      maxResults: z.number().optional(),
      lastEventId: z.string().optional(),
    }))
    .output(eventIterator(BackgroundEventSchema))
    .errors(CommonPluginErrors),

  // Manual background event publishing
  enqueueBackground: oc
    .route({ method: 'POST', path: '/enqueueBackground' })
    .input(z.object({
      id: z.string().optional(),
    }))
    .output(z.object({
      ok: z.boolean(),
    }))
    .errors(CommonPluginErrors),
});
