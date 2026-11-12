export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export const bad = (msg: string) => new HttpError(400, msg);

/**
 * Express 4 ignores rejected promises from async handlers (the request would hang).
 * This patch forwards them to next(err), so every async route/middleware reaches the error handler.
 */
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const Layer = require_('express/lib/router/layer.js');
const handle = Layer.prototype.handle_request;
Layer.prototype.handle_request = function (req: unknown, res: unknown, next: (err?: unknown) => void) {
  const fn = this.handle;
  if (fn.length > 3) return handle.call(this, req, res, next);
  try {
    const r = fn(req, res, next);
    if (r && typeof r.catch === 'function') r.catch(next);
  } catch (e) {
    next(e);
  }
};
