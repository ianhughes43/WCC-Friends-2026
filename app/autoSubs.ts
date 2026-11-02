// Projected in-play FPL autosubs. Never use these projections to finalise Squid eliminations.
import type { EntryEventPicksResponse, Fixture } from "./types";

type Player = { id: number; team: number; element_type?: number };
type LivePlayer = { id: number; stats: { total_points: number; minutes: number } };
export type Projection = { points: number; autoSubDelta: number; projected: boolean };

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
  const pick = [...response.picks].sort((a,b) => a.position-b.position);
  const points = (id:number) => byId.get(id)?.total_points ?? 0;
  const type = (id:number) => playerById.get(id)?.element_type ?? 0;
  // A zero-minute player can only be substituted when ALL their GW fixtures are finished.
  const hasFinished = (id:number) => {
    const team = playerById.get(id)?.team;
    if (!team) return false;
    const matches = fixtures.filter(f => f.team_h === team || f.team_a === team);
    return matches.length > 0 && matches.every(f => f.finished);
  };
  const absent = (id:number) => (byId.get(id)?.minutes ?? 0) === 0 && hasFinished(id);
  const raw = pick.reduce((sum,p) => sum + points(p.element)*p.multiplier,0);
  // Officially processed picks already contain the substitutions/captain changes.
  if (gameweekFinal || (response.automatic_subs?.length ?? 0) > 0) {
    return {points:raw,autoSubDelta:0,projected:false};
  }
  const bb = response.active_chip === "bboost";
  const starters = pick.filter(p=>p.position<=11);
  const bench = pick.filter(p=>p.position>11);
  const effective = new Set(starters.map(p=>p.element));
  let delta=0;
  if (!bb) {
    // FPL goalkeeper can only be replaced by the reserve goalkeeper.
    const outGk = starters.find(p=>type(p.element)===1 && absent(p.element));
    const inGk = bench.find(p=>type(p.element)===1 && (byId.get(p.element)?.minutes ?? 0) > 0);
    if (outGk && inGk) {
      effective.delete(outGk.element); effective.add(inGk.element);
      delta += points(inGk.element)-points(outGk.element);
    }
    const formationValid = (ids:Set<number>) => {
      const count=(t:number)=>[...ids].filter(id=>type(id)===t).length;
      return count(1)===1 && count(2)>=3 && count(2)<=5 && count(3)>=2 && count(3)<=5 && count(4)>=1 && count(4)<=3;
    };
    for(const sub of bench.filter(p=>type(p.element)!==1)) {
      if ((byId.get(sub.element)?.minutes ?? 0) === 0) continue;
      const missing=starters.filter(p=>type(p.element)!==1 && effective.has(p.element) && absent(p.element));
      const outgoing=missing.find(p=>{
        const next=new Set(effective);next.delete(p.element);next.add(sub.element);
        return formationValid(next);
      });
      if(outgoing){
        effective.delete(outgoing.element);effective.add(sub.element);
        delta += points(sub.element)-points(outgoing.element);
      }
    }
  }
  const captain=pick.find(p=>p.is_captain);
  const vice=pick.find(p=>p.is_vice_captain);
  if(captain && vice && absent(captain.element) && effective.has(vice.element)) {
    const extra=response.active_chip==="3xc"?2:1;
    delta += extra*(points(vice.element)-points(captain.element));
  }
  return {points:raw+delta,autoSubDelta:delta,projected:true};
}
