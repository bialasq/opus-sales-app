import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors";
import { InvalidFilenameError } from "../utils/filePathResolver";
import { createLogger } from "../services/appLogger";
import type { RequestWithId } from "./requestId";

const log = createLogger("middleware/errorHandler");

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req as RequestWithId).requestId || "unknown";

  if (err instanceof AppError) {
    log.warn(`${err.constructor.name}: ${err.message}`, {
      requestId,
      path: req.path,
      method: req.method,
      statusCode: err.statusCode,
    });
    res.status(err.statusCode).json({
      error: err.publicMessage,
      requestId,
    });
    return;
  }

  if (err instanceof InvalidFilenameError) {
    log.warn("Invalid filename", { requestId, path: req.path });
    res.status(400).json({ error: "Invalid filename", requestId });
    return;
  }

  log.error(`Unhandled error: ${err.message}`, {
    requestId,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: "Internal server error",
    requestId,
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  const requestId = (req as RequestWithId).requestId;
  res.status(404).json({
    error: "Route not found",
    path: req.path,
    ...(requestId ? { requestId } : {}),
  });
}
