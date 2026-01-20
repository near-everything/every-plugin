import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { kvStore } from '@/db/schema';
import { getPluginClient, getTestDb, runMigrations, teardown } from '../setup';

describe('API Integration', () => {
  const testOwner = 'test-user.near';

  beforeAll(async () => {
    await runMigrations();
  });

  beforeEach(async () => {
    const db = getTestDb();
    await db.delete(kvStore);
  });

  afterAll(async () => {
    await teardown();
  });

  describe('ping', () => {
    it('returns ok status', async () => {
      const client = await getPluginClient();

      const result = await client.ping();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('protected', () => {
    it('rejects unauthenticated requests', async () => {
      const client = await getPluginClient();

      await expect(client.protected()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('returns data with authenticated context', async () => {
      const client = await getPluginClient({ nearAccountId: testOwner });

      const result = await client.protected();

      expect(result.message).toBe('Protected data');
      expect(result.accountId).toBe(testOwner);
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('kv operations', () => {
    it('sets and gets a value', async () => {
      const client = await getPluginClient({ nearAccountId: testOwner });

      const setResult = await client.setValue({ key: 'test-key', value: 'test-value' });
      expect(setResult.key).toBe('test-key');
      expect(setResult.value).toBe('test-value');
      expect(setResult.created).toBe(true);

      const getResult = await client.getValue({ key: 'test-key' });
      expect(getResult.key).toBe('test-key');
      expect(getResult.value).toBe('test-value');
      expect(getResult.updatedAt).toBeDefined();
    });

    it('updates an existing value', async () => {
      const client = await getPluginClient({ nearAccountId: testOwner });

      await client.setValue({ key: 'update-key', value: 'initial' });
      const result = await client.setValue({ key: 'update-key', value: 'updated' });

      expect(result.created).toBe(false);
      expect(result.value).toBe('updated');
    });

    it('rejects getValue without auth', async () => {
      const client = await getPluginClient();

      await expect(
        client.getValue({ key: 'any-key' })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('rejects setValue without auth', async () => {
      const client = await getPluginClient();

      await expect(
        client.setValue({ key: 'any-key', value: 'any-value' })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('returns NOT_FOUND for missing key', async () => {
      const client = await getPluginClient({ nearAccountId: testOwner });

      await expect(
        client.getValue({ key: 'missing-key' })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });
});
