import { z } from "zod";
import { authed } from "@/server/http";
import { inviteToRoom } from "@/server/rooms";

export const POST = authed(z.object({ friendId: z.string().uuid() }), async ({ user, body, params }) => inviteToRoom(params.code, user, body.friendId));
