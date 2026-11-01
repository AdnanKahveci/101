import { z } from "zod";
import { authed } from "@/server/http";
import { AVATARS } from "@/server/auth";
import { getPreferences, updatePreferences, updateProfile } from "@/server/social";

export const GET = authed(undefined, async ({ user }) => ({ preferences: await getPreferences(user.id), user }));

export const PUT = authed(
  z.object({
    displayName: z.string().max(32).optional(),
    avatar: z.enum(AVATARS).optional(),
    preferences: z
      .object({
        soundEnabled: z.boolean().optional(),
        sortMode: z.enum(["color", "value"]).optional(),
        confirmDiscard: z.boolean().optional(),
        animations: z.boolean().optional(),
      })
      .optional(),
  }),
  async ({ user, body }) => {
    await updateProfile(user.id, { displayName: body.displayName, avatar: body.avatar });
    const preferences = body.preferences ? await updatePreferences(user.id, body.preferences) : await getPreferences(user.id);
    return { ok: true, preferences };
  },
);
