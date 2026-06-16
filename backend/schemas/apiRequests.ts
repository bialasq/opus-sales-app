import { z } from "zod";
import { FILENAME_REGEX } from "../utils/filePathResolver";

const uploadFilenameSchema = z
  .string()
  .min(1, "filename jest wymagany")
  .regex(FILENAME_REGEX, "Invalid filename");

/** POST body: operacje na pliku w uploads/ */
export const filenameBodySchema = z.object({
  filename: uploadFilenameSchema,
});

export type FilenameBody = z.infer<typeof filenameBodySchema>;

export const sendReminderBodySchema = z.object({
  invoiceNumber: z.string().optional(),
  customerId: z.string().optional(),
});

export const paymentsOverdueBodySchema = z
  .object({
    filename: uploadFilenameSchema.optional(),
  })
  .passthrough();

export const promotionsBodySchema = z
  .object({
    products: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string(),
          rotationRate: z.number(),
          stock: z.number().optional(),
          minStock: z.number().optional(),
        })
      )
      .optional(),
    seasonalData: z.record(z.string(), z.array(z.number())).optional(),
  })
  .passthrough();

export const generateReportBodySchema = z.object({
  analysisData: z.unknown(),
  format: z.enum(["pdf", "html"]).optional().default("pdf"),
});

export const comprehensiveExpertAiBodySchema = z.object({
  analysisData: z.unknown(),
});

export type ComprehensiveExpertAiBody = z.infer<
  typeof comprehensiveExpertAiBodySchema
>;

export const routeOptimizationBodySchema = z.object({
  visitData: z.unknown(),
  priorities: z.unknown(),
});

export const aiAgentTypeSchema = z.enum([
  "salesOptimizer",
  "routePlanner",
  "salesCoach",
  "productAnalyzer",
  "customerInsights",
]);

export const aiInsightsBodySchema = z.object({
  data: z.unknown(),
  agentType: aiAgentTypeSchema,
  /** Opcjonalnie: plik w uploads/ — agent używa function calling zamiast pełnego JSON */
  filename: uploadFilenameSchema.optional(),
});

export const visitPlanBodySchema = z.object({
  profiles: z.record(z.string(), z.any()),
});

const userInstructionsField = z
  .string()
  .max(2000, "Wytyczne AI: maks. 2000 znaków")
  .optional();

export const aiInsightsQuerySchema = z.object({
  filename: z.preprocess(
    (v) => (Array.isArray(v) ? v[0] : v),
    uploadFilenameSchema
  ),
  userInstructions: z.preprocess(
    (v) => (Array.isArray(v) ? v[0] : v),
    userInstructionsField
  ),
});

export type AiInsightsQuery = z.infer<typeof aiInsightsQuerySchema>;

export const aiInsightsRunBodySchema = z.object({
  filename: uploadFilenameSchema,
  userInstructions: userInstructionsField,
});

export const aiInsightsJobParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

export const planRouteBodySchema = z.object({
  filename: uploadFilenameSchema,
  userInstructions: userInstructionsField,
});

export type PlanRouteBody = z.infer<typeof planRouteBodySchema>;

export const suggestionFeedbackBodySchema = z.object({
  sessionId: z.string().uuid(),
  suggestionIndex: z.number().int().min(0),
  verdict: z.enum(["approve", "reject"]),
  title: z.string().min(1),
  description: z.string().min(1),
  filename: uploadFilenameSchema.optional(),
});
