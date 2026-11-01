import { authed } from "@/server/http";
import { leaveRoom } from "@/server/rooms";

export const POST = authed(undefined, async ({ user, params }) => leaveRoom(params.code, user));
