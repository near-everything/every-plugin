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
});
