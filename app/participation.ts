import { EntryEventPicksResponse, EntryHistoryResponse, Fixture } from "./types";
import type { Participation } from "./Participation";

type LiveElement = { id: number; stats: { minutes: number } };

// Public transfer history gives an estimate, not a confirmed current FT balance.
// FPL's 2024+ rules permit banking up to five free transfers.
function estimatedFT(history: EntryHistoryResponse, gw: number): number | null {
  if (gw < 1) return null;
  let available = 1;
  const rows = new Map(history.current.map(row => [row.event, row]));
  const chips = new Map((history.chips as { event?: number; name?: string }[]).map(chip => [chip.event, chip.name]));
  for (let week = 1; week < gw; week++) {
    const row = rows.get(week);
    if (!row) return null;
    const chip = chips.get(week);
    if (chip === "wildcard" || chip === "freehit") {
      // Banked transfers survive these chips under current FPL rules.
      available = Math.min(5, available + 1);
    } else {
      available = Math.min(5, Math.max(0, available - row.event_transfers) + 1);
    }
  }
  return available;
}

export function calculateParticipation(
  picks: EntryEventPicksResponse | null,
  history: EntryHistoryResponse,
  gw: number,
  elementToTeam: Map<number, number>,
  fixtures: Fixture[],
  live: LiveElement[]
): Participation | undefined {
  if (!picks) return undefined;
  const ft = estimatedFT(history, gw);
  const minutes = new Map(live.map(element => [element.id, element.stats.minutes]));
  const fixturesByTeam = new Map<number, Fixture[]>();
  for (const fixture of fixtures) {
    for (const team of [fixture.team_h, fixture.team_a]) {
      const list = fixturesByTeam.get(team) || [];
      list.push(fixture);
      fixturesByTeam.set(team, list);
    }
  }
  let played = 0;
  let total = 0;
  for (const pick of picks.picks) {
    const multiplier = pick.multiplier;
    if (multiplier <= 0) continue;
    total += multiplier;
    const team = elementToTeam.get(pick.element);
    const matches = team == null ? [] : fixturesByTeam.get(team) || [];
    if (matches.length > 0 && matches.every(match => match.finished) && (minutes.get(pick.element) ?? 0) > 0) {
      played += multiplier;
    }
  }
  return { played, total, ft };
}
