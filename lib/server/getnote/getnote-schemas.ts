import { z } from "zod";

const providerRequestIdSchema = z.string().trim().min(1).max(200).nullable().optional();

export const getNoteProviderEnvelopeSchema = z
  .object({
    success: z.boolean(),
    data: z.unknown().nullable(),
    error: z.unknown().nullable().optional(),
    meta: z.unknown().optional(),
    request_id: providerRequestIdSchema,
  })
  .passthrough();

export const getNoteProviderErrorSchema = z
  .object({
    code: z.union([z.number().int(), z.string()]).optional(),
    reason: z.string().optional(),
  })
  .passthrough();

const providerIdentifierSchema = z.string().trim().min(1).max(200);

const directSaveLinkDataSchema = z
  .object({
    note_id: providerIdentifierSchema.nullable().optional(),
    task_id: providerIdentifierSchema.nullable().optional(),
  })
  .passthrough()
  .refine((data) => data.note_id != null || data.task_id != null, {
    message: "A note_id or task_id is required",
  });

const taskListSaveLinkDataSchema = z
  .object({
    created_count: z.number().int().nonnegative().optional(),
    tasks: z
      .array(
        z
          .object({
            task_id: providerIdentifierSchema,
            url: z.string().optional(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

export const saveLinkProviderDataSchema = z
  .union([directSaveLinkDataSchema, taskListSaveLinkDataSchema])
  .transform(
    (data): { kind: "pending"; taskId: string } | { kind: "completed"; externalNoteId: string } => {
      const taskListResult = taskListSaveLinkDataSchema.safeParse(data);
      if (taskListResult.success) {
        return {
          kind: "pending",
          taskId: taskListResult.data.tasks[0].task_id,
        };
      }

      const directData = directSaveLinkDataSchema.parse(data);
      if (directData.note_id != null) {
        return {
          kind: "completed",
          externalNoteId: directData.note_id,
        };
      }

      if (directData.task_id != null) {
        return {
          kind: "pending",
          taskId: directData.task_id,
        };
      }

      throw new Error("A note_id or task_id is required");
    },
  );

export const taskProgressProviderDataSchema = z
  .object({
    status: z.enum(["pending", "processing", "success", "failed"]),
    note_id: providerIdentifierSchema.nullable().optional(),
  })
  .passthrough()
  .refine((data) => data.status !== "success" || data.note_id != null, {
    message: "A successful task must include note_id",
  });

export const noteDetailProviderDataSchema = z
  .object({
    note: z
      .object({
        id: providerIdentifierSchema.optional(),
        note_id: providerIdentifierSchema,
        title: z.string(),
        web_page: z
          .object({
            content: z.string().optional().default(""),
            url: z.string(),
            excerpt: z.string().optional().default(""),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

export type GetNoteProviderEnvelope = z.infer<typeof getNoteProviderEnvelopeSchema>;
export type SaveLinkProviderData = z.infer<typeof saveLinkProviderDataSchema>;
export type TaskProgressProviderData = z.infer<typeof taskProgressProviderDataSchema>;
export type NoteDetailProviderData = z.infer<typeof noteDetailProviderDataSchema>;
