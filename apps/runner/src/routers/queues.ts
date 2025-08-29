import { QueueService, QueueStatusService } from '../queue';
import type { QueueName } from '@usersdotfun/shared-types/types';
import { Effect } from 'effect';
import { z } from 'zod';
import { authenticatedProcedure } from '../lib/orpc';

// Inline schema definitions
const deleteJobParamSchema = z.object({
  queueName: z.string(),
  jobId: z.string(),
});

const queueNameParamSchema = z.object({
  queueName: z.string(),
});

const clearQueueSchema = z.object({
  queueName: z.string(),
  jobType: z.enum(['all', 'completed', 'failed']),
});

export const queueRouter = {
  getAll: authenticatedProcedure.handler(async ({ context }) => {
    const program = Effect.gen(function* () {
      const queueStatusService = yield* QueueStatusService;
      const statuses = yield* queueStatusService.getQueuesStatus();
      return { success: true, data: statuses };
    });

    return await context.runtime.runPromise(program);
  }),

  getAllJobs: authenticatedProcedure.handler(async ({ context }) => {
    const program = Effect.gen(function* () {
      const queueStatusService = yield* QueueStatusService;
      const jobs = yield* queueStatusService.getAllJobs();
      return { success: true, data: jobs };
    });

    return await context.runtime.runPromise(program);
  }),

  getQueueJobs: authenticatedProcedure
    .input(z.object({ queueName: z.string() }))
    .handler(async ({ input, context }) => {
      const { queueName } = input;
      
      const program = Effect.gen(function* () {
        const queueStatusService = yield* QueueStatusService;
        const jobs = yield* queueStatusService.getAllJobs({ queueName: queueName as QueueName });
        return { success: true, data: jobs };
      });

      return await context.runtime.runPromise(program);
    }),

  deleteJob: authenticatedProcedure
    .input(deleteJobParamSchema)
    .handler(async ({ input, context }) => {
      const { queueName, jobId } = input;
      
      const program = Effect.gen(function* () {
        const queueService = yield* QueueService;
        yield* queueService.removeJob(queueName as QueueName, jobId);
        return { success: true, data: { message: `Job ${jobId} has been deleted.` } };
      });

      return await context.runtime.runPromise(program);
    }),

  resumeQueue: authenticatedProcedure
    .input(queueNameParamSchema)
    .handler(async ({ input, context }) => {
      const { queueName } = input;
      
      const program = Effect.gen(function* () {
        const queueService = yield* QueueService;
        yield* queueService.resumeQueue(queueName as QueueName);
        return { success: true, data: { message: `Queue ${queueName} has been resumed.` } };
      });

      return await context.runtime.runPromise(program);
    }),

  pauseQueue: authenticatedProcedure
    .input(queueNameParamSchema)
    .handler(async ({ input, context }) => {
      const { queueName } = input;
      
      const program = Effect.gen(function* () {
        const queueService = yield* QueueService;
        yield* queueService.pauseQueue(queueName as QueueName);
        return { success: true, data: { message: `Queue ${queueName} has been paused.` } };
      });

      return await context.runtime.runPromise(program);
    }),

  clearQueue: authenticatedProcedure
    .input(clearQueueSchema)
    .handler(async ({ input, context }) => {
      const { queueName, jobType } = input;
      
      const program = Effect.gen(function* () {
        const queueService = yield* QueueService;
        const result = yield* queueService.clearQueue(queueName as QueueName, jobType);
        return { success: true, data: result };
      });

      return await context.runtime.runPromise(program);
    })
};
