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
      defaultMaxResults: 10,
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

  describe('Plugin Initialization', () => {
    it('should initialize successfully with valid config', async () => {
      expect(plugin.id).toBe("@curatedotfun/masa-source");
      expect(plugin.type).toBe("source");
      expect(mockClient.healthCheck).toHaveBeenCalled();
    });

    it('should create router without errors', () => {
      const router = plugin.createRouter();
      expect(router).toBeDefined();
    });
  });

  describe('Client Integration', () => {
    it('should call submitSearchJob with correct parameters', async () => {
      // Mock successful API response
      mockClient.submitSearchJob.mockResolvedValue("job-12345");

      // Access the private client through the plugin for testing
      const client = (plugin as any).client;
      expect(client).toBeDefined();

      // Test the client method directly
      const jobId = await client.submitSearchJob(
        "twitter",
        "searchbyquery",
        "@curatedotfun",
        25,
        undefined
      );

      expect(jobId).toBe("job-12345");
      expect(mockClient.submitSearchJob).toHaveBeenCalledWith(
        "twitter",
        "searchbyquery", 
        "@curatedotfun",
        25,
        undefined
      );
    });

    it('should handle API errors gracefully', async () => {
      // Mock API failure
      mockClient.submitSearchJob.mockRejectedValue(
        new Error('Network/API Error: {"error":"Invalid JSON input","details":"Unexpected token o in JSON at position 1","status":400,"statusText":"Bad Request"}')
      );

      const client = (plugin as any).client;
      
      await expect(
        client.submitSearchJob("twitter", "searchbyquery", "@curatedotfun", 25)
      ).rejects.toThrow("Network/API Error");
    });
  });

  describe('Plugin Configuration', () => {
    it('should have correct contract structure', () => {
      expect(plugin.contract).toBeDefined();
      expect(plugin.contract.search).toBeDefined();
      expect(plugin.contract.getById).toBeDefined();
      expect(plugin.contract.getBulk).toBeDefined();
      expect(plugin.contract.similaritySearch).toBeDefined();
      expect(plugin.contract.hybridSearch).toBeDefined();
      expect(plugin.contract.getProfile).toBeDefined();
      expect(plugin.contract.getTrends).toBeDefined();
    });

    it('should have correct schema definitions', () => {
      expect(plugin.configSchema).toBeDefined();
      expect(plugin.stateSchema).toBeDefined();
    });
  });
});
