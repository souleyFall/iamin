import { AsyncLocalStorage } from 'node:async_hooks';

/** Ce que chaque ligne de journal écrite pendant une requête sait de cette requête. */
export interface RequestContext {
  reqId: string;
  /** Renseigné par la garde de session quand la requête est authentifiée. */
  userId?: string;
  role?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithContext = <T>(ctx: RequestContext, fn: () => T): T => storage.run(ctx, fn);
export const currentContext = (): RequestContext | undefined => storage.getStore();

/** Rattache le compte à la requête en cours (appelé une fois la session reconnue). */
export function setRequestUser(userId: string, role: string): void {
  const ctx = storage.getStore();
  if (ctx) {
    ctx.userId = userId;
    ctx.role = role;
  }
}
