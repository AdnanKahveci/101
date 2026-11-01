import { authed } from "@/server/http";
import { myInvitations } from "@/server/rooms";

export const GET = authed(undefined, async ({ user }) => ({ invitations: await myInvitations(user.id) }));
