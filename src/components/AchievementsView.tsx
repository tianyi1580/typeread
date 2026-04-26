import { achievementDefinitions } from "../lib/achievements";
import type { AchievementAward } from "../types";
import { Card } from "./ui/card";
import { InfoTooltip, InfoIcon } from "./ui/InfoTooltip";

export function AchievementsView({ earnedAwards }: { earnedAwards: AchievementAward[] }) {
  const earnedMap = new Map(earnedAwards.map((award) => [award.key, award.earnedAt]));

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden bg-gradient-to-br from-[rgba(166,218,149,0.1)] to-transparent p-8">
        <div className="flex items-center gap-3">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Achievements</p>
          <InfoTooltip content="Earn rewards for speed, volume, and accuracy milestones." trigger="click">
            <InfoIcon className="h-3.5 w-3.5" />
          </InfoTooltip>
        </div>
        <h1 className="mt-4 text-4xl font-bold tracking-tight">Milestones</h1>
        <p className="mt-6 max-w-3xl text-base leading-relaxed text-[var(--text-muted)]">
          Track your progress as you master the craft of typing.
        </p>
      </Card>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {achievementDefinitions.map((achievement) => {
          const earnedAt = earnedMap.get(achievement.key);
          return (
            <Card
              key={achievement.key}
              className={`p-5 transition ${
                earnedAt
                  ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--panel)_80%,var(--accent-soft)_20%)]"
                  : "border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_86%,transparent)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">{achievement.category}</p>
                  <h2 className="mt-3 text-2xl font-semibold">{achievement.name}</h2>
                </div>
                <div
                  className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${
                    earnedAt ? "bg-[var(--accent)] text-black" : "bg-black/15 text-[var(--text-muted)]"
                  }`}
                >
                  {earnedAt ? "Earned" : "Locked"}
                </div>
              </div>
              <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">{achievement.description}</p>
              <div className="mt-6 rounded-[20px] border border-[var(--border)] bg-black/10 px-4 py-3 text-sm">
                {earnedAt ? `Earned on ${new Date(earnedAt).toLocaleDateString()}` : "Not earned yet."}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
