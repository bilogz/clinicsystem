import { createSupabaseApiMiddleware } from '../server/supabaseApi';
import type { IncomingMessage, ServerResponse } from 'http';

export type ApiMiddleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void | Promise<void>;

export function createMiddleware(options: Record<string, unknown>): ApiMiddleware {
  if (typeof createSupabaseApiMiddleware !== 'function') {
    throw new Error('createSupabaseApiMiddleware is not exported from server/supabaseApi.');
  }
  return createSupabaseApiMiddleware(options) as ApiMiddleware;
}
