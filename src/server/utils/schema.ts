/**
 * @file Zod schemas for liveness endpoint request bodies.
 */

import { z } from "zod";

export const livenessChallengeEnum = z.enum([
  "registration",
  "authentication",
  "step-up",
]);

export const registeredModalityEnum = z.enum([
  "face",
  "fingerprint",
  "iris",
  "other",
  "unknown",
]);

export const createSessionSchema = z.object({
  challenge: livenessChallengeEnum,
  /** Optional hint from the client about the registered passkey modality. */
  registeredModality: registeredModalityEnum.optional(),
  /** Only honoured for authentication challenges (registration uses session). */
  userId: z.string().optional(),
});

export const verifySessionSchema = z.object({
  sessionId: z.string().min(1),
});
