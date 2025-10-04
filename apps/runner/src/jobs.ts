// {
//   "name": "open_crosspost",
//   "source": {
//     "pluginId": "@curatedotfun/masa-source",
//     "config": {
//       "secrets": {
//         "apiKey": "{{GOPHERAI_API_KEY}}"
//       }
//     },
//     "search": {
//       "type": "twitter",
//       "query": "@open_crosspost #feature",
//       "pageSize": 100
//     }
//   },
//   "pipeline": {
//     "id": "test-pipeline",
//     "name": "Simple Transform Pipeline",
//     "steps": [
//       {
//         "pluginId": "@curatedotfun/simple-transform",
//         "config": {
//           "variables": {
//             "template": "hello {{content}}"
//           }
//         },
//         "stepId": "transform-1"
//       },
//       {
//         "pluginId": "@curatedotfun/object-transform",
//         "config": {
//           "variables": {
//             "mappings": {
//               "content": "goodbye {{content}}"
//             }
//           }
//         },
//         "stepId": "transform-2"
//       },
//       {
//         "pluginId": "@curatedotfun/simple-transform",
//         "config": {
//           "variables": {
//             "template": "hello {{content}}"
//           }
//         },
//         "stepId": "transform-3"
//       }
//     ],
//     "env": {
//       "secrets": [
//         "GOPHERAI_API_KEY"
//       ]
//     }
//   }
// }

// {
//   "name": "test_telegram",
//   "source": {
//     "pluginId": "@curatedotfun/masa-source",
//     "config": {
//       "secrets": {
//         "botToken": "{{TELEGRAM_BOT_TOKEN}}"
//       }
//     },
//     "search": {
//       "chatId": "test_curation",
//     }
//   },
//   "pipeline": {
//     "id": "test-pipeline",
//     "name": "Simple Transform Pipeline",
//     "steps": [
//       {
//         "pluginId": "@curatedotfun/simple-transform",
//         "config": {
//           "variables": {
//             "template": "hello {{content}}"
//           }
//         },
//         "stepId": "transform-1"
//       },
//       {
//         "pluginId": "@curatedotfun/object-transform",
//         "config": {
//           "variables": {
//             "mappings": {
//               "content": "goodbye {{content}}"
//             }
//           }
//         },
//         "stepId": "transform-2"
//       },
//       {
//         "pluginId": "@curatedotfun/simple-transform",
//         "config": {
//           "variables": {
//             "template": "hello {{content}}"
//           }
//         },
//         "stepId": "transform-3"
//       }
//     ],
//     "env": {
//       "secrets": [
//         "TELEGRAM_BOT_TOKEN"
//       ]
//     }
//   }
// }

import { Effect } from "effect";
import { WorkflowService } from "./db";
import { QUEUE_NAMES, QueueService } from "./queue";

export const discoverAndScheduleWorkflows = Effect.gen(function* () {
	const workflowService = yield* WorkflowService;
	const queueService = yield* QueueService;

	yield* Effect.log("Discovering and scheduling workflows...");

	const workflows = yield* workflowService.getWorkflows();
	const activeWorkflows = workflows.filter(
		(workflow) => workflow.status === "ACTIVE",
	);
	const scheduledWorkflows = activeWorkflows.filter(
		(workflow) => workflow.schedule && workflow.schedule.trim() !== "",
	);

	yield* Effect.log(
		`Found ${activeWorkflows.length} active workflows, ${scheduledWorkflows.length} with schedules`,
	);

	yield* Effect.forEach(
		scheduledWorkflows,
		(workflow) =>
			Effect.gen(function* () {
				yield* queueService.upsertScheduledJob(
					QUEUE_NAMES.WORKFLOW_RUN,
					workflow.id, // Use workflow ID as scheduler ID
					{ pattern: workflow.schedule! }, // Cron pattern
					{
						name: "scheduled-workflow-run",
						data: {
							workflowId: workflow.id,
							data: { triggeredBy: null }, // system
						},
					},
				);
				yield* Effect.log(
					`Upserted scheduled job for workflow "${workflow.name}" (${workflow.id})`,
				);
			}),
		{ concurrency: 5, discard: true },
	);
});
