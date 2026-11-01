import { z } from "zod";
import { authed } from "@/server/http";
import { respondInvitation } from "@/server/rooms";

export const POST = authed(z.object({ accept: z.boolean() }), async ({ user, body, params }) =>
  respondInvitation(user.id, params.id, body.accept, user),
);
