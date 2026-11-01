import { authed } from "@/server/http";
import { matchHistory } from "@/server/social";

export const GET = authed(undefined, async ({ user }) => ({ matches: await matchHistory(user.id) }));
