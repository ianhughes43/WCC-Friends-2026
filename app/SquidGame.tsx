import { getEntryEventPicks, getEventLive, getFixtures } from "./fpl";
import { ParticipationCells, Participation } from "./Participation";
import { EntryHistoryResponse, FplEvent, LeagueStanding } from "./types";

const SQUID_START_GW = 4;
const SQUID_FINAL_GW = 32;

type HistoryBundle = {
  manager: LeagueStanding;
  history: EntryHistoryResponse;
};

type SquidGameProps = {
  standings: LeagueStanding[];
  events: FplEvent[];
  currentEvent: FplEvent;
  histories: HistoryBundle[];
  liveScores: Record<number, number>;
  participation: Record<number, Participation | undefined>;
};

type Elimination = {
  gw: number;
  entry: number;
  team: string;
  manager: string;
  points: number;
  transferCost: number;
  squidPoints: number;
  startingGoals?: number;
  tieBreaker?: { opponents: { team: string; goals: number }[] };
};

type PendingTie = {
  gw: number;
  points: number;
  managers: {
    entry: number;
    team: string;
    manager: string;
    points: number;
    transferCost: number;
    squidPoints: number;
    startingGoals?: number;
  }[];
};

function transferCost(row: unknown) {
  if (!row || typeof row !== "object") return 0;
  const value = (row as { event_transfers_cost?: unknown }).event_transfers_cost;
  return typeof value === "number" ? value : 0;
}

export default async function SquidGame({
  standings,
  events,
  currentEvent,
  histories,
  liveScores,
  participation,
}: SquidGameProps) {
  // Use the most recent passed deadline, with the bootstrap current event as
  // a fallback if the API omits deadlines. Never process the active GW.
  const now = Date.now();
  const startedEvents = events
    .filter((event) => Number.isFinite(Date.parse(event.deadline_time)) && Date.parse(event.deadline_time) <= now)
    .sort((a, b) => b.id - a.id);
  const activeEvent = startedEvents[0] || currentEvent;
  const activeGwId = activeEvent.id;
  // FPL's Gameweek `finished` flag can lag behind the last fixture.
  // Close the active GW once all its fixtures are officially finished AND
  // every league manager has a published history score for that GW.
  let activeFixturesFinished = false;
  if (activeGwId >= SQUID_START_GW && activeGwId <= SQUID_FINAL_GW && !activeEvent.finished) {
    try {
      const fixtures = await getFixtures(activeGwId);
      activeFixturesFinished = fixtures.length > 0 && fixtures.every((fixture) => fixture.finished);
    } catch {
      // If fixture data is unavailable, wait for FPL's official finished flag.
    }
  }
  const allActiveScoresPublished = standings.every((manager) =>
    histories.some(({ manager: historicalManager, history }) =>
      historicalManager.entry === manager.entry &&
      history.current.some((row) => row.event === activeGwId)
    )
  );
  const activeGwClosed = activeEvent.finished || (activeFixturesFinished && allActiveScoresPublished);
  const completedSquidGws = events
    .filter((event) =>
      event.id >= SQUID_START_GW &&
      event.id <= SQUID_FINAL_GW &&
      (event.id < activeGwId || (event.id === activeGwId && activeGwClosed))
    )
    .map((event) => event.id)
    .sort((a, b) => a - b);

  // FPL live endpoint reports actual goals for every player in a completed GW.
  // Only original starting XI positions 1–11 count; captain goals count once.
  const goalsCache = new Map<number, Map<number, number> | null>();
  async function startingGoals(entry: number, gw: number): Promise<number | null> {
    if (!goalsCache.has(gw)) {
      try {
        const live = await getEventLive(gw);
        goalsCache.set(gw, new Map(live.elements.map((p) => [p.id, (p.stats as typeof p.stats & { goals_scored?: number }).goals_scored ?? 0])));
      } catch {
        goalsCache.set(gw, null);
      }
    }
    const goals = goalsCache.get(gw);
    if (!goals) return null;
    try {
      const picks = await getEntryEventPicks(entry, gw);
      if (!picks?.picks || picks.picks.length < 11) return null;
      let total = 0;
      for (const pick of picks.picks.filter((p) => p.position <= 11)) {
        const count = goals.get(pick.element);
        if (count === undefined) return null;
        total += count;
      }
      return total;
    } catch {
      return null;
    }
  }

  const alive = new Set(standings.map((manager) => manager.entry));
  const eliminations: Elimination[] = [];
  let pendingTie: PendingTie | null = null;

  for (const gw of completedSquidGws) {
    if (gw > activeGwId || (gw === activeGwId && !activeGwClosed)) continue;
    const scores = histories
      .filter(({ manager }) => alive.has(manager.entry))
      .map(({ manager, history }) => {
        const gwHistory = history.current.find((row) => row.event === gw);
        const officialPoints = gwHistory?.points ?? null;
        const points = officialPoints;
        const cost = transferCost(gwHistory);
        return {
          entry: manager.entry,
          team: manager.entry_name,
          manager: manager.player_name,
          points,
          transferCost: cost,
          squidPoints: points === null ? null : points - cost,
        };
      })
      .filter(
        (
          result
        ): result is {
          entry: number;
          team: string;
          manager: string;
          points: number;
          transferCost: number;
          squidPoints: number;
        } => result.points !== null && result.squidPoints !== null
      );

    // Never declare an elimination from an incomplete set of manager scores.
    if (scores.length !== alive.size) break;

    const lowestScore = Math.min(...scores.map((result) => result.squidPoints));
    const lowestManagers = scores.filter((result) => result.squidPoints === lowestScore);

    let eliminationCandidates = lowestManagers;
    let tieBreaker: Elimination["tieBreaker"];
    if (lowestManagers.length > 1) {
      const goalCounts = await Promise.all(lowestManagers.map(async (result) => ({
        ...result,
        startingGoals: await startingGoals(result.entry, gw),
      })));
      // Never decide a tie if FPL goal data or picks are unavailable.
      if (goalCounts.some((result) => result.startingGoals === null)) {
        pendingTie = { gw, points: lowestScore, managers: goalCounts.map((result) => ({
          ...result, startingGoals: result.startingGoals ?? undefined,
        })) };
        break;
      }
      const fewestGoals = Math.min(...goalCounts.map((result) => result.startingGoals!));
      eliminationCandidates = goalCounts.filter((result) => result.startingGoals === fewestGoals);
      if (eliminationCandidates.length === 1) {
        tieBreaker = { opponents: goalCounts.map((result) => ({ team: result.team, goals: result.startingGoals! })) };
      }
      if (eliminationCandidates.length > 1) {
        pendingTie = { gw, points: lowestScore, managers: goalCounts.map((result) => ({
          ...result, startingGoals: result.startingGoals ?? undefined,
        })) };
        break;
      }
    }

    const eliminated = eliminationCandidates[0];
    alive.delete(eliminated.entry);
    eliminations.push({
      gw,
      entry: eliminated.entry,
      team: eliminated.team,
      manager: eliminated.manager,
      points: eliminated.points,
      transferCost: eliminated.transferCost,
      squidPoints: eliminated.squidPoints,
      tieBreaker,
    });
  }

  const aliveManagers = standings.filter((manager) => alive.has(manager.entry));
  const liveGwActive =
    activeGwId >= SQUID_START_GW &&
    activeGwId <= SQUID_FINAL_GW &&
    !activeGwClosed;

  const liveRows = aliveManagers
    .map((manager) => {
      const officialPoints = liveScores[manager.entry];
      const historyRow = histories
        .find(({ manager: historyManager }) => historyManager.entry === manager.entry)
        ?.history.current.find((row) => row.event === activeGwId);
      const cost = transferCost(historyRow);
      const points = officialPoints;
      return {
        ...manager,
        points,
        transferCost: cost,
        squidPoints: typeof points === "number" ? points - cost : points,
      };
    })
    .filter((manager) => typeof manager.squidPoints === "number")
    .sort((a, b) => a.squidPoints - b.squidPoints || a.rank - b.rank);

  const lowestLive = liveRows.length ? liveRows[0].squidPoints : null;
  const hasStarted = completedSquidGws.length > 0 || activeEvent.id >= SQUID_START_GW;

  return (
    <section className="competition squidCompetition">
      <div className="competitionHero squidHero">
        <div>
          <div className="eyebrow squidEyebrow">SURVIVAL COMPETITION</div>
          <h2>🦑 Squid Game</h2>
          <p>GW4–GW32 · Lowest scorer eliminated every Gameweek</p>
        </div>
        <div className="heroNumber">
          <span>Alive</span>
          <strong>{aliveManagers.length}</strong>
        </div>
      </div>

      <div className="ruleStrip">
        <span>🏆 Winner £100</span>
        <span>⚡ Squid points = player points − transfer cost</span>
        <span>🔄 Live scores auto-refresh</span>
      </div>

      {!hasStarted && (
        <article className="card noticeCard">
          <h3>Squid starts in Gameweek 4</h3>
          <p>All {standings.length} current league managers are still alive.</p>
        </article>
      )}

      {pendingTie && (
        <article className="card warningCard">
          <div className="cardHead">
            <h2>⚠️ Admin decision required — GW{pendingTie.gw}</h2>
            <span>{pendingTie.points} pts</span>
          </div>
          <div className="warningBody">
            <p>These managers are tied on Squid points. Tie-break: fewer goals scored by the original starting XI is eliminated (captain goals count once). If goals are also tied or FPL data is unavailable, an admin decision is required.</p>
            {pendingTie.managers.map((manager) => (
              <div className="simpleRow" key={manager.entry}>
                <div><a className="teamLink" href={`https://fantasy.premierleague.com/en/entry/${manager.entry}/event/${activeEvent.id}`} target="_blank" rel="noreferrer"><b>{manager.team}</b><small>{manager.manager}</small></a></div>
                <strong>{manager.points} - {manager.transferCost} = {manager.squidPoints} · Starting XI goals: {manager.startingGoals ?? "—"}</strong>
              </div>
            ))}
          </div>
        </article>
      )}

      {liveGwActive && (
        <article className="card liveCard">
          {pendingTie && pendingTie.gw < activeGwId && (
            <p className="warningBody">GW{pendingTie.gw} elimination is awaiting a goals tie-break or admin decision. Both tied managers remain in the provisional survival table; no elimination has been applied.</p>
          )}
          <div className="cardHead">
            <h2>🔴 Gameweek {activeGwId} Live Survival</h2>
            <span>auto 60s</span>
          </div>
          {liveRows.length > 0 ? (
            <div className="tableWrap noMax">
              <table>
                <thead>
                  <tr><th>Zone</th><th>Team / Manager</th><th>Points</th><th>Played</th><th>Transfer Cost</th><th>Squid</th></tr>
                </thead>
                <tbody>
                  {liveRows.map((manager) => {
                    const danger = manager.squidPoints === lowestLive;
                    const warning =
                      lowestLive !== null &&
                      manager.squidPoints > lowestLive &&
                      manager.squidPoints <= lowestLive + 10;
                    const rowClass = danger ? "dangerRow" : warning ? "warningRow" : "safeRow";
                    const badgeClass = danger ? "dangerBadge" : warning ? "warningBadge" : "safeBadge";
                    const label = danger ? "LAST" : warning ? "DANGER" : "SAFE";

                    return (
                      <tr className={rowClass} key={manager.entry}>
                        <td><span className={badgeClass}>{label}</span></td>
                        <td><a className="teamLink" href={`https://fantasy.premierleague.com/en/entry/${manager.entry}/event/${activeEvent.id}`} target="_blank" rel="noreferrer"><b>{manager.entry_name}</b><small>{manager.player_name}</small></a></td>
                        <td className="scoreCell"><b>{manager.points}</b></td>
                        <ParticipationCells value={participation[manager.entry]} />
                        <td className="scoreCell"><b>{manager.transferCost ? `-${manager.transferCost}` : "0"}</b></td>
                        <td className="scoreCell"><b>{manager.squidPoints}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="emptyState">Live scores will appear here once FPL publishes this Gameweek&apos;s manager scores.</div>
          )}
        </article>
      )}

      {activeGwClosed && activeGwId >= SQUID_START_GW && activeGwId <= SQUID_FINAL_GW && (
        <article className="card noticeCard">
          <h3>GW{activeGwId} closed</h3>
          <p>{pendingTie ? "Elimination tie awaiting resolution; no manager has been removed for this Gameweek." : "Final scores processed. The elimination is shown in Elimination History below."}</p>
        </article>
      )}

      <div className="competitionGrid">
        <article className="card">
          <div className="cardHead"><h2>Still Alive</h2><span>{aliveManagers.length}</span></div>
          <div className="compactList">
            {aliveManagers.map((manager) => (
              <div className="simpleRow" key={manager.entry}>
                <div><a className="teamLink" href={`https://fantasy.premierleague.com/en/entry/${manager.entry}/event/${activeEvent.id}`} target="_blank" rel="noreferrer"><b>{manager.entry_name}</b><small>{manager.player_name}</small></a></div>
                <span className="safeBadge">ALIVE</span>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <div className="cardHead"><h2>Elimination History</h2><span>{eliminations.length}</span></div>
          {eliminations.length ? (
            <div className="compactList">
              {eliminations.slice().reverse().map((elimination) => (
                <div className="simpleRow" key={`${elimination.gw}-${elimination.entry}`}>
                  <span className="gwBadge">GW{elimination.gw}</span>
                  <div className="grow"><a className="teamLink" href={`https://fantasy.premierleague.com/en/entry/${elimination.entry}/event/${activeEvent.id}`} target="_blank" rel="noreferrer"><b>{elimination.team}</b><small>{elimination.manager}</small></a></div>
                  <div><strong>{elimination.points} - {elimination.transferCost} = {elimination.squidPoints}</strong>
                    {elimination.tieBreaker && (
                      <div><small><b>Eliminated on tie-breaker — Starting XI goals</b></small><small>{elimination.tieBreaker.opponents.map((opponent) => `${opponent.team}: ${opponent.goals}`).join(" · ")}</small></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="emptyState">No eliminations yet.</div>
          )}
        </article>
      </div>
    </section>
  );
}
