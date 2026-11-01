import { open } from "@/server/http";

export const GET = open(undefined, async ({ user }) => ({ user }));
