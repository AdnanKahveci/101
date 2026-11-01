import { z } from "zod";
import { authed, open } from "@/server/http";
import { createRoom, listPublicRooms, myRooms } from "@/server/rooms";

export const GET = open(undefined, async ({ user }) => ({
  rooms: await listPublicRooms(),
  mine: user ? await myRooms(user.id) : [],
}));

export const POST = authed(
  z.object({
    name: z.string().max(48),
    visibility: z.enum(["public", "private"]),
    password: z.string().max(64).nullish(),
    settings: z.record(z.string(), z.unknown()).optional(),
  }),
  async ({ user, body }) => ({ room: await createRoom(user, body) }),
);
