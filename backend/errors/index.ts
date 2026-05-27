export class AppError extends Error {
  statusCode: number;
  publicMessage: string;

  constructor(statusCode: number, publicMessage: string, internalMessage?: string) {
    super(internalMessage || publicMessage);
    this.statusCode = statusCode;
    this.publicMessage = publicMessage;
    this.name = "AppError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, internal?: string) {
    super(400, message, internal);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, internal?: string) {
    super(404, `${resource} not found`, internal);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(internal?: string) {
    super(401, "Unauthorized", internal);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(internal?: string) {
    super(403, "Forbidden", internal);
    this.name = "ForbiddenError";
  }
}

export class LlmProviderError extends AppError {
  constructor(provider: string, internal: string) {
    super(502, `LLM provider error (${provider})`, internal);
    this.name = "LlmProviderError";
  }
}
