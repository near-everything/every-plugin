import { createServerFileRoute } from '@tanstack/react-start/server';
import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/source';

const server = createFromSource(source, {
  // https://docs.orama.com/docs/orama-js/supported-languages
  language: 'english',
});

export const ServerRoute = createServerFileRoute('/api/search').methods({
  GET: async ({ request }) => server.GET(request),
});
