import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

export type RequestWithId = Request & { requestId?: string };

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incoming = req.header("x-request-id");
  const requestId = (incoming || randomUUID()).slice(0, 64);
  (req as RequestWithId).requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}
