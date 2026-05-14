import type { RequestHandler } from "express";
import type { AnyZodObject } from "zod";

/**
 * Parsuje req.body wg schematu Zod; przy błędzie 400 + flatten.
 * Po sukcesie podstawia req.body wynikiem (typowanym).
 */
export function validateBody<S extends AnyZodObject>(schema: S): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Niepoprawne dane wejściowe",
        details: parsed.error.flatten(),
      });
      return;
    }
    req.body = parsed.data as typeof req.body;
    next();
  };
}

export function validateQuery<S extends AnyZodObject>(schema: S): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Niepoprawne parametry zapytania",
        details: parsed.error.flatten(),
      });
      return;
    }
    req.query = parsed.data as typeof req.query;
    next();
  };
}
