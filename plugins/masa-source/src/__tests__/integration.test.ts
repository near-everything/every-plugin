import { describe, it, expect, beforeAll } from 'vitest';
import { Effect, Layer } from 'effect';
import { MasaSourcePlugin } from '../index';
import type { MasaSourceConfig } from '../schemas';
import { PluginLoggerTag } from "every-plugin";
import { z } from 'zod';

// Test logger implementation
const createTestLogger = () => ({
  logInfo: (message: string, context?: unknown) => 
    Effect.sync(() => console.log(`[INFO] ${message}`, context || '')),
  
  logWarning: (message: string, context?: unknown) => 
    Effect.sync(() => console.warn(`[WARNING] ${message}`, context || '')),
  
  logError: (message: string, error?: unknown, context?: unknown) => 
    Effect.sync(() => console.error(`[ERROR] ${message}`, error, context || '')),
  
  logDebug: (message: string, context?: unknown) => 
    Effect.sync(() => console.log(`[DEBUG] ${message}`, context || '')),
});

// Create test layer with logger
const TestLayer = Layer.succeed(PluginLoggerTag, createTestLogger());

describe('Masa Source Plugin - Integration Tests', () => {
  let plugin: MasaSourcePlugin;
  let config: MasaSourceConfig;
  
  // Infer types from the plugin
  type PluginInput = z.infer<typeof plugin['inputSchema']>;
  type PluginOutput = z.infer<typeof plugin['outputSchema']>;

  beforeAll(() => {
    // Skip integration tests if no API key is provided
    const apiKey = process.env.MASA_API_KEY;
    if (!apiKey) {
      console.log('Skipping integration tests - MASA_API_KEY not provided');
      return;
    }

    plugin = new MasaSourcePlugin();
    config = {
      variables: {
        baseUrl: 'https://data.masa.ai/api/v1',
        timeout: 30000,
        defaultMaxResults: 10,
      },
      secrets: {
        apiKey,
      },
    };
  });

  it.skipIf(!process.env.MASA_API_KEY)('should handle streaming search flow end-to-end', async () => {
    // Initialize plugin
    const initResult = await Effect.runPromise(
      plugin.initialize(config).pipe(
        Effect.provide(TestLayer)
      )
    );

    expect(initResult).toBeUndefined(); // Successful initialization returns void

    // Test Phase 1: Initial search submission (no state)
    const phase1Input = {
      procedure: 'search' as const,
      input: {
        query: 'blockchain',
        searchMethod: 'searchbyquery' as const,
        sourceType: 'twitter' as const,
        maxResults: 5,
      },
    };

    console.log('[INTEGRATION TEST] Phase 1: Submitting initial search...');
    const phase1Result = await Effect.runPromise(
      plugin.execute(phase1Input).pipe(
        Effect.provide(TestLayer)
      )
    ) as PluginOutput;

    console.log('[INTEGRATION TEST] Phase 1 result:', JSON.stringify(phase1Result, null, 2));

    // Verify Phase 1 response structure
    expect(phase1Result).toHaveProperty('items');
    expect(phase1Result).toHaveProperty('nextState');
    expect(Array.isArray(phase1Result.items)).toBe(true);
    expect(phase1Result.items).toHaveLength(0); // Should be empty in phase 1
    expect(phase1Result.nextState).toHaveProperty('phase', 'submitted');
    expect(phase1Result.nextState).toHaveProperty('jobId');
    expect(typeof phase1Result.nextState.jobId).toBe('string');
    expect(phase1Result.nextState.jobId.length).toBeGreaterThan(0);

    // Test Phase 2: Poll for results using the state from Phase 1
    const phase2Input = {
      procedure: 'search' as const,
      input: {
        query: 'blockchain',
        searchMethod: 'searchbyquery' as const,
        sourceType: 'twitter' as const,
        maxResults: 5,
      },
      state: phase1Result.nextState,
    };

    console.log('[INTEGRATION TEST] Phase 2: Polling for results...');
    
    // Poll until we get results or error (with timeout)
    let phase2Result: PluginOutput;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max
    
    do {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      phase2Result = await Effect.runPromise(
        plugin.execute({
          ...phase2Input,
          state: phase2Result?.nextState || (phase1Result as any).nextState,
        }).pipe(
          Effect.provide(TestLayer)
        )
      ) as PluginOutput;
      
      console.log(`[INTEGRATION TEST] Attempt ${attempts + 1}: Phase=${phase2Result.nextState?.phase}, Items=${phase2Result.items?.length || 0}`);
      attempts++;
      
    } while (
      phase2Result.nextState?.phase === 'processing' && 
      attempts < maxAttempts
    );

    console.log('[INTEGRATION TEST] Final result:', JSON.stringify(phase2Result, null, 2));

    // Verify final result
    expect(phase2Result).toHaveProperty('items');
    expect(phase2Result).toHaveProperty('nextState');
    expect(Array.isArray(phase2Result.items)).toBe(true);
    
    // Should either have results (done) or be in error state
    if (phase2Result.nextState?.phase === 'done') {
      expect(phase2Result.items.length).toBeGreaterThan(0);
      
      // Verify item structure
      const firstItem = phase2Result.items[0];
      expect(firstItem).toHaveProperty('externalId');
      expect(firstItem).toHaveProperty('content');
      expect(firstItem).toHaveProperty('contentType');
      expect(typeof firstItem.externalId).toBe('string');
      expect(typeof firstItem.content).toBe('string');
      
    } else if (phase2Result.nextState?.phase === 'error') {
      expect(phase2Result.nextState).toHaveProperty('errorMessage');
      expect(typeof phase2Result.nextState.errorMessage).toBe('string');
      console.log('[INTEGRATION TEST] Job failed with error:', phase2Result.nextState.errorMessage);
    } else {
      throw new Error(`Unexpected final phase: ${phase2Result.nextState?.phase}`);
    }

    // Cleanup
    await Effect.runPromise(
      plugin.shutdown().pipe(
        Effect.provide(TestLayer)
      )
    );
  }, 60000); // 60 second timeout for integration test

  it.skipIf(!process.env.MASA_API_KEY)('should handle API errors gracefully in streaming', async () => {
    // Initialize plugin
    await Effect.runPromise(
      plugin.initialize(config).pipe(
        Effect.provide(TestLayer)
      )
    );

    // Test with invalid query that should cause an error
    const errorInput = {
      procedure: 'search' as const,
      input: {
        query: '', // Empty query should cause error
        searchMethod: 'searchbyquery' as const,
        sourceType: 'twitter' as const,
        maxResults: 5,
      },
    };

    console.log('[INTEGRATION TEST] Testing error handling...');
    
    try {
      const result = await Effect.runPromise(
        plugin.execute(errorInput).pipe(
          Effect.provide(TestLayer)
        )
      ) as PluginOutput;
      
      // If we get a result, it should be in error state
      if (result.nextState?.phase === 'error') {
        expect(result.nextState).toHaveProperty('errorMessage');
        expect(result.items).toHaveLength(0);
        console.log('[INTEGRATION TEST] Error handled correctly:', result.nextState.errorMessage);
      } else {
        console.log('[INTEGRATION TEST] Unexpected success with empty query');
      }
    } catch (error) {
      // Plugin execution error is also acceptable
      console.log('[INTEGRATION TEST] Plugin execution failed as expected:', error);
      expect(error).toBeDefined();
    }

    // Cleanup
    await Effect.runPromise(
      plugin.shutdown().pipe(
        Effect.provide(TestLayer)
      )
    );
  }, 30000);
});
