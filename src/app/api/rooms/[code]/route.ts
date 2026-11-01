import { z } from "zod";
import { authed, open } from "@/server/http";
import { getRoom, updateRoom } from "@/server/rooms";

export const GET = open(undefined, async ({ req, user, params }) => {
  const token = new URL(req.url).searchParams.get("t");
  return getRoom(params.code, user, token);
});

export const PATCH = authed(
  z.object({
    name: z.string().max(48).optional(),
    visibility: z.enum(["public", "private"]).optional(),
    password: z.string().max(64).nullish(),
    settings: z.record(z.string(), z.unknown()).optional(),
  }),
  async ({ user, body, params }) => ({ room: await updateRoom(params.code, user, body) }),
);
