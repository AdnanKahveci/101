import { GameClient } from "@/components/game/game-client";

export const metadata = { title: "Oyun masası" };

export default async function GamePage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return <GameClient matchId={matchId} />;
}
