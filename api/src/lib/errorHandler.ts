import { Request, Response, NextFunction } from 'express';

/**
 * Terminal Express error-handling middleware. Logs the real error server-side
 * and returns a generic 500 to the client so internal details are never leaked.
 * Mounted last in app.ts so any error forwarded via next(err) — including from
 * asyncHandler-wrapped routes — produces a response instead of a hung request.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error('[error]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal server error' });
}
