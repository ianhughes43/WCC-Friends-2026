import { getEntryEventPicks, getEventLive } from "./fpl";
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
  tieBreaker?: { method: "goals" | "conceded"; opponents: { team: string; goals: number; conceded?: number }[] };
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
    startingConceded?: number;
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
  // Eliminate only after FPL has finalised the Gameweek, including
  // automatic substitutions and final points checks. A completed fixture
  // list or a published history row is NOT evidence of finalisation.
  // FPL's official event.finished flag marks the Gameweek as closed.
  // Do not rely on data_checked: it may remain false after the final
  // Gameweek scores and automatic substitutions have been published.
  // Crucially, fixture completion alone must NEVER trigger elimination.
  // A Gameweek is safe to settle only when FPL explicitly marks it
  // finished, or FPL has officially moved it to its PREVIOUS event.
  // Neither elapsed deadlines nor finished fixtures qualify.
  const isFinalised = (event: FplEvent): boolean =>
    event.finished === true ||
    (event.is_previous === true && events.some((next) => next.id > event.id && next.is_current === true));
  const activeGwClosed = isFinalised(activeEvent);
  const completedSquidGws = events
    .filter((event) =>
      event.id >= SQUID_START_GW &&
      event.id <= SQUID_FINAL_GW &&
      event.id <= activeGwId &&
      isFinalised(event)
    )
    .map((event) => event.id)
    .sort((a, b) => a - b);

  // Use the original starting XI (positions 1–11), not the bench.
  // Captaincy does not multiply goals or goals conceded.
  type PlayerStats = { goals: number; conceded: number };
  const statsCache = new Map<number, Map<number, PlayerStats> | null>();
  async function startingStats(entry: number, gw: number): Promise<{ goals: number; conceded: number } | null> {
    if (!statsCache.has(gw)) {
      try {
        const live = await getEventLive(gw);
        statsCache.set(gw, new Map(live.elements.map((p) => {
          const stats = p.stats as typeof p.stats & { goals_scored?: number; goals_conceded?: number };
          return [p.id, { goals: stats.goals_scored ?? 0, conceded: stats.goals_conceded ?? 0 }];
        })));
      } catch {
        statsCache.set(gw, null);
      }
    }
    const stats = statsCache.get(gw);
    if (!stats) return null;
    try {
      const picks = await getEntryEventPicks(entry, gw);
      if (!picks?.picks || picks.picks.length < 11) return null;
      let goals = 0;
      let conceded = 0;
      for (const pick of picks.picks.filter((p) => p.position <= 11)) {
        const player = stats.get(pick.element);
        if (!player) return null;
        goals += player.goals;
        conceded += player.conceded;
      }
      return { goals, conceded };
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
      const statsRows = await Promise.all(lowestManagers.map(async (result) => ({
        ...result,
        startingStats: await startingStats(result.entry, gw),
      })));
      // Missing data must never trigger an elimination.
      const pendingManagers = statsRows.map(({ startingStats, ...result }) => ({
        ...result,
        startingGoals: startingStats?.goals,
        startingConceded: startingStats?.conceded,
      }));
      if (statsRows.some((result) => result.startingStats === null)) {
        pendingTie = { gw, points: lowestScore, managers: pendingManagers };
        break;
      }

      const fewestGoals = Math.min(...statsRows.map((result) => result.startingStats!.goals));
      const goalsTied = statsRows.filter((result) => result.startingStats!.goals === fewestGoals);
      if (goalsTied.length === 1) {
        eliminationCandidates = goalsTied;
        tieBreaker = {
          method: "goals",
          opponents: statsRows.map((result) => ({ team: result.team, goals: result.startingStats!.goals })),
        };
      } else {
        // Second tie-break: among managers tied for fewest goals,
        // the one whose original starting XI conceded MOST is eliminated.
        const mostConceded = Math.max(...goalsTied.map((result) => result.startingStats!.conceded));
        const concededTied = goalsTied.filter((result) => result.startingStats!.conceded === mostConceded);
        if (concededTied.length !== 1) {
          pendingTie = { gw, points: lowestScore, managers: pendingManagers };
          break;
        }
        eliminationCandidates = concededTied;
        tieBreaker = {
          method: "conceded",
          opponents: statsRows.map((result) => ({
            team: result.team,
            goals: result.startingStats!.goals,
            conceded: result.startingStats!.conceded,
          })),
        };
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

  // Show tie-break evidence even when FPL has not yet flagged this GW as final.
  // This preview never changes alive/eliminated status.
  const provisionalTied = !activeGwClosed && liveRows.length > 1
    ? liveRows.filter((row) => row.squidPoints === liveRows[0].squidPoints)
    : [];
  const provisionalTieStats = provisionalTied.length > 1
    ? await Promise.all(provisionalTied.map(async (row) => ({
        entry: row.entry,
        team: row.entry_name,
        manager: row.player_name,
        stats: await startingStats(row.entry, activeGwId),
      })))
    : [];
  const availableTieStats = provisionalTieStats.every((row) => row.stats !== null);
  const lowestTieGoals = availableTieStats && provisionalTieStats.length
    ? Math.min(...provisionalTieStats.map((row) => row.stats!.goals))
    : null;
  const lowestGoalsRows = lowestTieGoals === null ? []
    : provisionalTieStats.filter((row) => row.stats!.goals === lowestTieGoals);
  const mostTieConceded = lowestGoalsRows.length > 1
    ? Math.max(...lowestGoalsRows.map((row) => row.stats!.conceded))
    : null;
  const likelyEliminated = lowestGoalsRows.length === 1 ? lowestGoalsRows[0]
    : mostTieConceded === null ? null
    : lowestGoalsRows.filter((row) => row.stats!.conceded === mostTieConceded).length === 1
      ? lowestGoalsRows.find((row) => row.stats!.conceded === mostTieConceded) ?? null
      : null;

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
            <p>These managers are tied on Squid points. Tie-breaks: fewer goals scored by the original starting XI loses; if still tied, more goals conceded by the original starting XI loses. Captaincy does not multiply either statistic. If still tied or data is unavailable, an admin decision is required.</p>
            {pendingTie.managers.map((manager) => (
              <div className="simpleRow" key={manager.entry}>
                <div><a className="teamLink" href={`https://fantasy.premierleague.com/en/entry/${manager.entry}/event/${activeEvent.id}`} target="_blank" rel="noreferrer"><b>{manager.team}</b><small>{manager.manager}</small></a></div>
                <strong>{manager.points} - {manager.transferCost} = {manager.squidPoints} · XI goals: {manager.startingGoals ?? "—"} · XI conceded: {manager.startingConceded ?? "—"}</strong>
              </div>
            ))}
          </div>
        </article>
      )}

      {liveGwActive && (
        <article className="card liveCard">
          {pendingTie && pendingTie.gw < activeGwId && (
            <p className="warningBody">GW{pendingTie.gw} elimination is awaiting tie-break data or an admin decision. Both tied managers remain in the provisional survival table; no elimination has been applied.</p>
          )}
          <div className="cardHead">
            <h2>🔴 Gameweek {activeGwId} Live Survival</h2>
            <span>auto 60s</span>
          </div>
          {provisionalTieStats.length > 1 && (
            <div className="warningBody">
              <p><b>GW{activeGwId} tie-break comparison — provisional until FPL confirms finalisation</b></p>
              <p>First: fewer original starting XI goals scored loses. Second: more original starting XI goals conceded loses. Captain goals count once.</p>
              {provisionalTieStats.map((row) => (
                <div className="simpleRow" key={`tie-preview-${row.entry}`}>
                  <span>{row.team} ({row.manager})</span>
                  <strong>{row.stats ? `${row.stats.goals} goals scored · ${row.stats.conceded} conceded` : "FPL player data unavailable"}</strong>
                </div>
              ))}
              <p>{!availableTieStats
                ? "Tie-break data is not yet available. No elimination can be confirmed."
                : likelyEliminated
                  ? `${likelyEliminated.team} is provisionally last after the tie-break. No elimination until FPL marks the Gameweek final.`
                  : "Still tied after both tie-breakers. An admin decision will be required once scores are final."}</p>
            </div>
          )}
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
                      <div><small><b>Eliminated on tie-breaker — {elimination.tieBreaker.method === "goals" ? "Starting XI goals scored" : "Starting XI goals conceded"}</b></small><small>{elimination.tieBreaker.opponents.map((opponent) => `${opponent.team}: ${opponent.goals} scored${elimination.tieBreaker?.method === "conceded" ? `, ${opponent.conceded} conceded` : ""}`).join(" · ")}</small></div>
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
