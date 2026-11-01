import { z } from "zod";
import { authed } from "@/server/http";
import { joinRoom } from "@/server/rooms";

export const POST = authed(
  z.object({ password: z.string().max(64).nullish(), token: z.string().max(64).nullish(), invitationId: z.string().uuid().nullish() }),
  async ({ user, body, params }) => ({ room: await joinRoom(params.code, user, body) }),
);
