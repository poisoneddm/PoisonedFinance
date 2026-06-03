import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async Express handler so a rejected promise is forwarded to the
 * error-handling middleware via next(err). Express 4 does NOT catch rejected
 * promises from async handlers on its own, which otherwise leaves the request
 * hanging until it times out.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
