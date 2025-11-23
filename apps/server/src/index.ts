import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins'
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { BatchHandlerPlugin } from '@orpc/server/plugins'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { createContext, createRouter, initializePlugins } from '@data-provider/api'
import { serverEnv } from './env'

const plugins = await initializePlugins({
  secrets: { REDIS_URL: serverEnv.REDIS_URL, DUNE_API_KEY: serverEnv.DUNE_API_KEY, NEAR_INTENTS_API_KEY: serverEnv.NEAR_INTENTS_API_KEY, COINMARKETCAP_API_KEY: serverEnv.COINMARKETCAP_API_KEY },
  isDevelopment: serverEnv.NODE_ENV !== 'production'
});

const router = createRouter(plugins);

const app = new Hono()

app.use('/*', cors({
  origin: serverEnv.CORS_ORIGIN?.split(',').map(origin => origin.trim())
    ?? ['http://localhost:3001'],
  credentials: true,
}))

// Create RPC handler
const rpcHandler = new RPCHandler(router, {
  plugins: [new BatchHandlerPlugin()],
  interceptors: [
    onError((error) => {
      console.error('RPC Error:', error)
    }),
  ]
})

// Create OpenAPI handler
const apiHandler = new OpenAPIHandler(router, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
      specGenerateOptions: {
        info: {
          title: 'everything intents',
          version: '1.0.0',
        },
        servers: [ // or let the plugin auto-infer from the request
          { url: 'https://intents.everything.dev/api', },
          { url: 'http://localhost:8787/api' },
        ],
      },
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error('OpenAPI Error:', error)
    }),
  ],
})

// Health check
app.get('/', (c) => {
  return c.text('OK')
})

// RPC endpoint
app.all('/api/rpc/*', async (c) => {
  if (!rpcHandler) return c.text('Loading...', 503)

  const req = c.req.raw
  const context = await createContext(req)

  const result = await rpcHandler.handle(req, {
    prefix: '/api/rpc',
    context
  })

  return result.response
    ? c.newResponse(result.response.body, result.response)
    : c.text('Not Found', 404)
})

// REST/OpenAPI endpoint (w/ OpenAPI Documentation UI)
app.all('/api/*', async (c) => {
  if (!apiHandler) return c.text('Loading...', 503)

  const req = c.req.raw
  const context = await createContext(req)

  const result = await apiHandler.handle(req, {
    prefix: '/api',
    context
  });

  return result.response
    ? c.newResponse(result.response.body, result.response)
    : c.text('Not Found', 404)
})

// 404 handler

app.all('*', (c) => c.text('Not Found', 404))

export default {
  port: serverEnv.PORT,
  fetch: app.fetch,
};
