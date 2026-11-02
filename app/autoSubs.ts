// In-play estimates only. Squid elimination continues to use officially finalised FPL history.
import type { EntryEventPicksResponse, Fixture } from "./types";

type Player = { id: number; team: number; element_type?: number };
type LivePlayer = { id: number; stats: { total_points: number; minutes: number } };
export type Projection = {
  points: number;
  autoSubDelta: number;
  projected: boolean;
  // Number of effective scoring appearances added by projected substitutions.
  playedDelta: number;
  potential: boolean;
};

export function projectAutoSubs(
  response: EntryEventPicksResponse,
  live: LivePlayer[],
  fixtures: Fixture[],
  players: Player[],
  gameweekFinal: boolean
): Projection | null {
  if (!response?.picks?.length || !live.length || !fixtures.length) return null;
  const byId = new Map(live.map(p => [p.id, p.stats]));
  const playerById = new Map(players.map(p => [p.id, p]));
  const picks = [...response.picks].sort((a,b) => a.position - b.position);
  const points = (id: number) => byId.get(id)?.total_points ?? 0;
  const minutes = (id: number) => byId.get(id)?.minutes ?? 0;
  const type = (id: number) => playerById.get(id)?.element_type ?? 0;
  const matches = (id: number) => {
    const team = playerById.get(id)?.team;
    return team ? fixtures.filter(f => f.team_h === team || f.team_a === team) : [];
  };
  // Once all matches have STARTED, a zero-minute starter can be projected out.
  // This is only a possibility until every match finishes: a late appearance
  // or another fixture in a double Gameweek can invalidate the projection.
  const absent = (id: number) => {
    const teamMatches = matches(id);
    return minutes(id) === 0 && teamMatches.length > 0 && teamMatches.every(f => f.started || f.finished);
  };
  const confirmedAbsent = (id: number) => matches(id).every(f => f.finished);
  const raw = picks.reduce((sum,p) => sum + points(p.element) * p.multiplier, 0);
  if (gameweekFinal || (response.automatic_subs?.length ?? 0) > 0) {
    return { points: raw, autoSubDelta: 0, projected: false, playedDelta: 0, potential: false };
  }
  const bb = response.active_chip === "bboost";
  const starters = picks.filter(p => p.position <= 11);
  const bench = picks.filter(p => p.position > 11);
  const effective = new Set(starters.map(p => p.element));
  let delta = 0;
  let playedDelta = 0;
  let potential = false;
  if (!bb) {
    const formationValid = (ids: Set<number>) => {
      const count = (t: number) => [...ids].filter(id => type(id) === t).length;
      return count(1) === 1 && count(2) >= 3 && count(2) <= 5 && count(3) >= 2 && count(3) <= 5 && count(4) >= 1 && count(4) <= 3;
    };
    const replace = (out: number, incoming: number) => {
      effective.delete(out);
      effective.add(incoming);
      delta += points(incoming) - points(out);
      playedDelta += 1; // Incoming bench player has played; outgoing starter has not.
      if (!confirmedAbsent(out)) potential = true;
    };
    const outGk = starters.find(p => type(p.element) === 1 && absent(p.element));
    const inGk = bench.find(p => type(p.element) === 1 && minutes(p.element) > 0);
    if (outGk && inGk) replace(outGk.element, inGk.element);
    // Bench order is mandatory, but a midfielder cannot replace a defender
    // when that would leave fewer than three defenders (James Andrews case).
    for (const sub of bench.filter(p => type(p.element) !== 1)) {
      if (minutes(sub.element) === 0) continue;
      const missing = starters.filter(p => type(p.element) !== 1 && effective.has(p.element) && absent(p.element));
      const outgoing = missing.find(p => {
        const next = new Set(effective);
        next.delete(p.element);
        next.add(sub.element);
        return formationValid(next);
      });
      if (outgoing) replace(outgoing.element, sub.element);
    }
  }
  const captain = picks.find(p => p.is_captain);
  const vice = picks.find(p => p.is_vice_captain);
  if (captain && vice && absent(captain.element) && effective.has(vice.element) && minutes(vice.element) > 0) {
    const extra = response.active_chip === "3xc" ? 2 : 1;
    delta += extra * (points(vice.element) - points(captain.element));
    // The effective captain multiplier moves from the absent captain to a
    // playing vice-captain. Participation counts multiplier-weighted slots,
    // so the vice-captain contributes this extra played slot as well.
    playedDelta += extra;
    if (!confirmedAbsent(captain.element)) potential = true;
  }
  return { points: raw + delta, autoSubDelta: delta, projected: true, playedDelta, potential };
}
