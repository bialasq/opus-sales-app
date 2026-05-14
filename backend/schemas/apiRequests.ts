import { z } from "zod";

/** POST body: operacje na pliku w uploads/ */
export const filenameBodySchema = z.object({
  filename: z.string().min(1, "filename jest wymagany"),
});

export type FilenameBody = z.infer<typeof filenameBodySchema>;

export const sendReminderBodySchema = z.object({
  invoiceNumber: z.string().optional(),
  customerId: z.string().optional(),
});

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
});

export const visitPlanBodySchema = z.object({
  profiles: z.record(z.string(), z.any()),
});

export const aiInsightsQuerySchema = z.object({
  filename: z.preprocess(
    (v) => (Array.isArray(v) ? v[0] : v),
    z.string().min(1)
  ),
});

export type AiInsightsQuery = z.infer<typeof aiInsightsQuerySchema>;
