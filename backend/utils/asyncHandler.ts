import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Owija asynchroniczny handler tak, że każdy odrzucony Promise trafia do
 * `next(err)` — czyli do centralnego errorHandlera. Dzięki temu trasy nie
 * muszą powtarzać bloków try/catch mapujących błędy domenowe na kody HTTP
 * (ValidationError → 4xx, FileNotOwnedError → 404, itd. robi errorHandler).
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}
