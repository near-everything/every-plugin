import { ORPCError, os } from "@orpc/server";
import type { ManagedRuntime } from "effect";
import type { WorkflowService } from "../../db";
import type { QueueService, QueueStatusService } from "../../queue";
import type { auth } from "./auth";
import type { Context } from "./context";

export const o = os.$context<
	Context & {
		runtime: ManagedRuntime.ManagedRuntime<
			WorkflowService | QueueService | QueueStatusService,
			never
		>;
	}
>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
	if (!context.user) {
		throw new ORPCError("UNAUTHORIZED");
	}

	if (context.user.banned) {
		throw new ORPCError("FORBIDDEN");
	}

	return next({ // anything that uses this middleware should be certain that user and session are not null
		context: {
			...context,
			session: context.session as typeof auth.$Infer.Session.session,
			user: context.user as typeof auth.$Infer.Session.user,
		},
	});
});

export const authenticatedProcedure = publicProcedure.use(requireAuth);

const requireNonAnonymous = o.middleware(async ({ context, next }) => { // THis can use requireAuth
	if (context.user!.isAnonymous) { // so this should be okay
		throw new ORPCError("FORBIDDEN");
	}

	return next();
});

export const nonAnonymousProcedure =
	authenticatedProcedure.use(requireNonAnonymous);

const requireAdmin = o.middleware(async ({ context, next }) => {
	// Check if user is admin by role or specific admin user ID
	const adminUserIds = process.env.ADMIN_USER_IDS?.split(",") || [];
	const isAdmin =
		context.user!.role === "admin" || adminUserIds.includes(context.user!.id);

	if (!isAdmin) {
		throw new ORPCError("FORBIDDEN");
	}

	return next();
});

export const adminProcedure = authenticatedProcedure.use(requireAdmin);
