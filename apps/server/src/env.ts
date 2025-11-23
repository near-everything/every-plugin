import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const serverEnv = createEnv({
  server: {
    REDIS_URL: z.string().min(1),
    NEAR_INTENTS_API_KEY: z.string().min(1),
    DUNE_API_KEY: z.string().min(1),
    COINMARKETCAP_API_KEY: z.string().min(1),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('8787').transform(Number),
    CORS_ORIGIN: z.string().optional(),
  },
  runtimeEnv: {
    REDIS_URL: process.env.REDIS_URL,
    NEAR_INTENTS_API_KEY: process.env.NEAR_INTENTS_API_KEY,
    DUNE_API_KEY: process.env.DUNE_API_KEY,
    COINMARKETCAP_API_KEY: process.env.COINMARKETCAP_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
  },
  skipValidation: process.env.SKIP_ENV_VALIDATION === 'true',
})
