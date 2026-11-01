import { Suspense } from "react";
import { PageLoading } from "@/components/require-session";
import { RoomClient } from "./room-client";

export const metadata = { title: "Oda lobisi" };

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <Suspense fallback={<PageLoading />}>
      <RoomClient code={code.toUpperCase()} />
    </Suspense>
  );
}
