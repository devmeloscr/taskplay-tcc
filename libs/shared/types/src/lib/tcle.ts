import { z } from 'zod';
import './idioma';

export const tcleDocument = z.object({
  version: z.string().min(1).max(20),
  title: z.string().min(1),
  summary: z.array(z.string().min(1)).min(1),
  sections: z
    .array(
      z.object({
        title: z.string().min(1),
        paragraphs: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
});

export type TcleDocument = z.infer<typeof tcleDocument>;
