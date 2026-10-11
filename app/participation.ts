import { EntryEventPicksResponse, EntryHistoryResponse, Fixture } from "./types";
import type { Participation } from "./Participation";

type LiveElement = { id: number; stats: { minutes: number } };

// Public transfer history gives an estimate, not a confirmed current FT balance.
// FPL's 2024+ rules permit banking up to five free transfers.
function estimatedFT(history: EntryHistoryResponse, gw: number, projectNext = false): number | null {
  if (gw < 1) return null;
  // GW1 has no free transfer: the first FT becomes available in GW2.
  let available = 0;
  const rows = new Map(history.current.map(row => [row.event, row]));
  const chips = new Map((history.chips as { event?: number; name?: string }[]).map(chip => [chip.event, chip.name]));
  for (let week = 1; week < gw; week++) {
    const row = rows.get(week);
    if (!row) return null;
    const chip = chips.get(week);
    if (chip === "wildcard" || chip === "freehit") {
      // These chips preserve the existing FT bank; they do not add an FT.
      // GW1 is exceptional: GW2 still starts with its first free transfer.
      if (week === 1) available = 1;
    } else {
      // Transfers in GW1 are initial squad selection, not use of free transfers.
      const used = week === 1 ? 0 : row.event_transfers;
      available = Math.min(5, Math.max(0, available - used) + 1);
    }
  }
  if (projectNext) {
    const row = rows.get(gw);
    if (!row) return null;
    const chip = chips.get(gw);
    if (chip !== "wildcard" && chip !== "freehit") {
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
  live: LiveElement[],
  projectNext = false
): Participation | undefined {
  if (!picks) return undefined;
  const ft = estimatedFT(history, gw, projectNext);
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
    if (matches.length > 0 && (minutes.get(pick.element) ?? 0) > 0) {
      played += multiplier;
    }
  }
  return { played, total, ft };
}
