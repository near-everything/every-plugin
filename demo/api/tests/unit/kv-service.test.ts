import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Cause, Effect, Exit, Layer } from 'every-plugin/effect';
import { kvStore } from '@/db/schema';
import { DatabaseLive } from '@/db/layer';
import { KvService, KvServiceLive } from '@/services/kv';
import { getTestDb, runMigrations, TEST_DB_URL } from '../setup';

describe('KvService', () => {
  const testOwner = 'test-user.near';
  const otherOwner = 'other-user.near';

  beforeAll(async () => {
    await runMigrations();
  });

  beforeEach(async () => {
    const db = getTestDb();
    await db.delete(kvStore);
  });

  function buildServiceLayer() {
    const Database = DatabaseLive(TEST_DB_URL);
    return KvServiceLive.pipe(Layer.provide(Database));
  }

  describe('setValue', () => {
    it('creates a new key-value pair', async () => {
      const Services = buildServiceLayer();
      const service = await Effect.runPromise(Effect.provide(KvService, Services));

      const result = await Effect.runPromise(
        service.setValue('my-key', 'my-value', testOwner)
      );

      expect(result.key).toBe('my-key');
      expect(result.value).toBe('my-value');
      expect(result.created).toBe(true);
    });

    it('updates an existing key owned by same user', async () => {
      const Services = buildServiceLayer();
      const service = await Effect.runPromise(Effect.provide(KvService, Services));

      await Effect.runPromise(service.setValue('update-key', 'initial', testOwner));
      const result = await Effect.runPromise(
        service.setValue('update-key', 'updated', testOwner)
      );

      expect(result.key).toBe('update-key');
      expect(result.value).toBe('updated');
      expect(result.created).toBe(false);
    });

    it('throws FORBIDDEN when updating key owned by another user', async () => {
      const Services = buildServiceLayer();
      const service = await Effect.runPromise(Effect.provide(KvService, Services));

      await Effect.runPromise(service.setValue('owned-key', 'value', testOwner));

      const exit = await Effect.runPromiseExit(
        service.setValue('owned-key', 'new-value', otherOwner)
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = Cause.squash(exit.cause);
        expect(error).toMatchObject({ code: 'FORBIDDEN' });
      }
    });
  });

  describe('getValue', () => {
    it('returns value for existing key owned by user', async () => {
      const Services = buildServiceLayer();
      const service = await Effect.runPromise(Effect.provide(KvService, Services));

      await Effect.runPromise(service.setValue('read-key', 'read-value', testOwner));
      const result = await Effect.runPromise(service.getValue('read-key', testOwner));

      expect(result.key).toBe('read-key');
      expect(result.value).toBe('read-value');
      expect(result.updatedAt).toBeDefined();
    });

    it('throws NOT_FOUND for non-existent key', async () => {
      const Services = buildServiceLayer();
      const service = await Effect.runPromise(Effect.provide(KvService, Services));

      const exit = await Effect.runPromiseExit(
        service.getValue('missing-key', testOwner)
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = Cause.squash(exit.cause);
        expect(error).toMatchObject({ code: 'NOT_FOUND' });
      }
    });

    it('throws FORBIDDEN when accessing key owned by another user', async () => {
      const Services = buildServiceLayer();
      const service = await Effect.runPromise(Effect.provide(KvService, Services));

      await Effect.runPromise(service.setValue('private-key', 'secret', testOwner));

      const exit = await Effect.runPromiseExit(
        service.getValue('private-key', otherOwner)
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = Cause.squash(exit.cause);
        expect(error).toMatchObject({ code: 'FORBIDDEN' });
      }
    });
  });
});
