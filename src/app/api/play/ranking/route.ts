import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMonthlyLeagueRanking } from "@/lib/play/ranking-engine";
import { TIER_LABEL, LEAGUE_LABEL, type PlayTierValue } from "@/components/play/tierStyles";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const boards = await getMonthlyLeagueRanking(userId);

  return NextResponse.json({
    leagues: boards.map((b) => {
      const tier = b.tier as PlayTierValue;
      return {
        tier,
        tierLabel: TIER_LABEL[tier],
        leagueLabel: LEAGUE_LABEL[tier],
        players: b.players,
      };
    }),
  });
}
