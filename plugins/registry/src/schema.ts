import { z } from "every-plugin/zod";

export const RegistryItemSchema = z.object({
  name: z.string(),
  type: z.string(),
  url: z.string(),
  version: z.string(),
  commit: z.string().optional(),
  buildId: z.string().optional(),
});

export const RegistrySchema = z.object({
  items: z.array(RegistryItemSchema),
  updatedAt: z.string(),
});

export const FastfsFileContentSchema = z.object({
  mimeType: z.string(),
  content: z.instanceof(Uint8Array),
});

export const SimpleFastfsSchema = z.object({
  relativePath: z.string(),
  content: FastfsFileContentSchema.optional(),
});

export const FastfsDataSchema = z.object({
  simple: SimpleFastfsSchema,
});

export type RegistryItem = z.infer<typeof RegistryItemSchema>;
export type Registry = z.infer<typeof RegistrySchema>;
export type FastfsFileContent = z.infer<typeof FastfsFileContentSchema>;
export type SimpleFastfs = z.infer<typeof SimpleFastfsSchema>;
export type FastfsUploadData = z.infer<typeof FastfsDataSchema>;
