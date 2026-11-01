import { authed } from "@/server/http";
import { startMatch } from "@/server/rooms";

export const POST = authed(undefined, async ({ user, params }) => startMatch(params.code, user));
