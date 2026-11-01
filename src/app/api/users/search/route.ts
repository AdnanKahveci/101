import { authed } from "@/server/http";
import { searchUsers } from "@/server/social";

export const GET = authed(undefined, async ({ req, user }) => ({ users: await searchUsers(user.id, new URL(req.url).searchParams.get("q") ?? "") }));
