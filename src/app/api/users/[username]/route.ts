import { open } from "@/server/http";
import { profile } from "@/server/social";

export const GET = open(undefined, async ({ params }) => profile(params.username));
