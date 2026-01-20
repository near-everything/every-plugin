import { eq } from "drizzle-orm";
import * as schema from "../db/schema/auth";
import type { Auth } from "./auth";
import type { Database } from "./database";

type SessionResult = Awaited<ReturnType<Auth["api"]["getSession"]>>;
type User = NonNullable<SessionResult>["user"];

export interface RequestContext {
  session: SessionResult;
  user: User | null;
  nearAccountId: string | null;
}

export async function createRequestContext(
  req: Request,
  auth: Auth,
  db: Database
): Promise<RequestContext> {
  const session = await auth.api.getSession({ headers: req.headers });

  let nearAccountId: string | null = null;
  if (session?.user?.id) {
    const nearAccount = await db.query.nearAccount.findFirst({
      where: eq(schema.nearAccount.userId, session.user.id),
    });
    nearAccountId = nearAccount?.accountId ?? null;
  }

  return {
    session,
    user: session?.user ?? null,
    nearAccountId,
  };
}
