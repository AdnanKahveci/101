import { z } from "zod";
import { authed } from "@/server/http";
import { friendsOverview, removeFriend, respondFriendRequest, sendFriendRequest } from "@/server/social";

export const GET = authed(undefined, async ({ user }) => friendsOverview(user.id));

export const POST = authed(
  z.discriminatedUnion("action", [
    z.object({ action: z.literal("request"), username: z.string().max(32) }),
    z.object({ action: z.literal("respond"), requestId: z.string().uuid(), accept: z.boolean() }),
    z.object({ action: z.literal("remove"), friendId: z.string().uuid() }),
  ]),
  async ({ user, body }) => {
    if (body.action === "request") return sendFriendRequest(user, body.username);
    if (body.action === "respond") return respondFriendRequest(user, body.requestId, body.accept);
    return removeFriend(user, body.friendId);
  },
);
