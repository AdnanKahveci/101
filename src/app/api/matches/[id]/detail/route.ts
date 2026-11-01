import { authed } from "@/server/http";
import { matchDetail } from "@/server/social";

export const GET = authed(undefined, async ({ user, params }) => matchDetail(user.id, params.id));
