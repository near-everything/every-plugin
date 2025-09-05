import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { MasaSourcePlugin } from '../index';
import { MasaClient } from '../client';
import type { MasaSourceConfig } from '../schemas';
import { PluginLoggerTag } from 'every-plugin';

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

// Mock the MasaClient to control API responses
vi.mock('../client');

describe('Masa Source Plugin Direct Tests', () => {
  let plugin: MasaSourcePlugin;
  let mockClient: any;

  const TEST_CONFIG: MasaSourceConfig = {
    variables: {
      baseUrl: "https://data.masa.ai/api/v1",
      timeout: 30000,
    },
    secrets: {
      apiKey: "test-api-key-12345",
    },
  };

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create mock client instance
    mockClient = {
      submitSearchJob: vi.fn(),
      checkJobStatus: vi.fn(),
      getJobResults: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue("OK"),
    };

    // Mock the MasaClient constructor
    (MasaClient as any).mockImplementation(() => mockClient);

    // Create and initialize plugin
    plugin = new MasaSourcePlugin();
    
    await Effect.runPromise(
      plugin.initialize(TEST_CONFIG).pipe(
        Effect.provide(TestLayer)
      )
    );
  });

  describe('Search Handler Error Scenarios', () => {
    it('should return error state when API submission fails', async () => {
      console.log('\n=== Testing API Submission Failure ===');
      
      // Mock API failure - should throw error since we removed {data, error} pattern
      mockClient.submitSearchJob.mockRejectedValue(
        new Error('Network/API Error: {"error":"Invalid JSON input","details":"Unexpected token o in JSON at position 1","status":400,"statusText":"Bad Request"}')
      );

      const input = {
        procedure: "search" as const,
        input: {
          query: "@curatedotfun",
          searchMethod: "searchbyquery" as const,
          sourceType: "twitter" as const,
          maxResults: 25
        },
        state: null
      };

      console.log('Input:', JSON.stringify(input, null, 2));

      const result = await Effect.runPromise(
        plugin.execute(input).pipe(
          Effect.provide(TestLayer)
        )
      );
      
      console.log('Direct plugin result:', JSON.stringify(result, null, 2));

      // Verify the structure
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("nextState");
      expect(result.items).toEqual([]);
      
      // This should be an error state, not undefined
      expect(result.nextState).not.toBeUndefined();
      expect(result.nextState).not.toBeNull();
      
      if (result.nextState) {
        expect(result.nextState.phase).toBe("error");
        expect(result.nextState.errorMessage).toContain("Network/API Error");
        expect(result.nextState.nextPollMs).toBeNull();
      }
    });

    it('should return success state when API submission succeeds', async () => {
      console.log('\n=== Testing API Submission Success ===');
      
      // Mock successful API response - should return raw value
      mockClient.submitSearchJob.mockResolvedValue("job-12345");

      const input = {
        procedure: "search" as const,
        input: {
          query: "@curatedotfun",
          searchMethod: "searchbyquery" as const,
          sourceType: "twitter" as const,
          maxResults: 25
        },
        state: null
      };

      console.log('Input:', JSON.stringify(input, null, 2));

      const result = await Effect.runPromise(
        plugin.execute(input).pipe(
          Effect.provide(TestLayer)
        )
      );
      
      console.log('Direct plugin result:', JSON.stringify(result, null, 2));

      // Verify the structure
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("nextState");
      expect(result.items).toEqual([]);
      
      // This should be a submitted state
      expect(result.nextState).not.toBeUndefined();
      expect(result.nextState).not.toBeNull();
      
      if (result.nextState) {
        expect(result.nextState.phase).toBe("submitted");
        expect(result.nextState.jobId).toBe("job-12345");
        expect(result.nextState.nextPollMs).toBe(1000);
      }
    });

  });

  describe('API Payload Testing', () => {
    it('should log the exact API payload being sent', async () => {
      console.log('\n=== Testing API Payload ===');
      
      // Mock to capture the call - should return raw value
      mockClient.submitSearchJob.mockImplementation((...args) => {
        console.log('submitSearchJob called with args:', args);
        return Promise.resolve("job-12345");
      });

      const input = {
        procedure: "search" as const,
        input: {
          query: "@curatedotfun",
          searchMethod: "searchbyquery" as const,
          sourceType: "twitter" as const,
          maxResults: 25
        },
        state: null
      };

      await Effect.runPromise(
        plugin.execute(input).pipe(
          Effect.provide(TestLayer)
        )
      );

      // Verify the client was called with correct parameters
      expect(mockClient.submitSearchJob).toHaveBeenCalledWith(
        "twitter",
        "searchbyquery", 
        "@curatedotfun",
        25,
        undefined
      );
    });
  });
});
