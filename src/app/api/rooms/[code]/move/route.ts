import { z } from "zod";
import { authed } from "@/server/http";
import { moveMember } from "@/server/rooms";

export const POST = authed(
  z.object({ userId: z.string().uuid(), seat: z.number().int().min(0).max(3).nullable() }),
  async ({ user, body, params }) => ({ room: await moveMember(params.code, user, body.userId, body.seat) }),
);
