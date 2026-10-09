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
};

type Elimination = {
  gw: number;
  entry: number;
  team: string;
  manager: string;
  points: number;
  transferCost: number;
  squidPoints: number;
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
  }[];
};

function transferCost(row: unknown) {
  if (!row || typeof row !== "object") return 0;
  const value = (row as { event_transfers_cost?: unknown }).event_transfers_cost;
  return typeof value === "number" ? value : 0;
}

export default function SquidGame({
  standings,
  events,
  currentEvent,
  histories,
  liveScores,
}: SquidGameProps) {
  // Use the most recent passed deadline, with the bootstrap current event as
  // a fallback if the API omits deadlines. Never process the active GW.
  const now = Date.now();
  const startedEvents = events
    .filter((event) => Number.isFinite(Date.parse(event.deadline_time)) && Date.parse(event.deadline_time) <= now)
    .sort((a, b) => b.id - a.id);
  const activeEvent = startedEvents[0] || currentEvent;
  const activeGwId = activeEvent.id;
  const completedSquidGws = events
    .filter((event) => event.id >= SQUID_START_GW && event.id <= SQUID_FINAL_GW && event.id < activeGwId)
    .map((event) => event.id)
    .sort((a, b) => a - b);

  const alive = new Set(standings.map((manager) => manager.entry));
  const eliminations: Elimination[] = [];
  let pendingTie: PendingTie | null = null;

  for (const gw of completedSquidGws) {
    if (gw >= activeGwId) continue;
    const scores = histories
      .filter(({ manager }) => alive.has(manager.entry))
      .map(({ manager, history }) => {
        const gwHistory = history.current.find((row) => row.event === gw);
        const officialPoints = gwHistory?.points ?? null;
        const points = officialPoints === null ? null : officialPoints + transferCost(gwHistory);
        const cost = transferCost(gwHistory);
        return {
          entry: manager.entry,
          team: manager.entry_name,
          manager: manager.player_name,
          points,
          transferCost: cost,
          squidPoints: points,
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

    if (lowestManagers.length > 1) {
      pendingTie = {
        gw,
        points: lowestScore,
        managers: lowestManagers.map((result) => ({
          entry: result.entry,
          team: result.team,
          manager: result.manager,
          points: result.points,
          transferCost: result.transferCost,
          squidPoints: result.squidPoints,
        })),
      };
      break;
    }

    const eliminated = lowestManagers[0];
    alive.delete(eliminated.entry);
    eliminations.push({
      gw,
      entry: eliminated.entry,
      team: eliminated.team,
      manager: eliminated.manager,
      points: eliminated.points,
      transferCost: eliminated.transferCost,
      squidPoints: eliminated.squidPoints,
    });
  }

  const aliveManagers = standings.filter((manager) => alive.has(manager.entry));
  const liveGwActive =
    activeGwId >= SQUID_START_GW &&
    activeGwId <= SQUID_FINAL_GW &&
    !activeEvent.finished &&
    !pendingTie;

  const liveRows = aliveManagers
    .map((manager) => {
      const officialPoints = liveScores[manager.entry];
      const historyRow = histories
        .find(({ manager: historyManager }) => historyManager.entry === manager.entry)
        ?.history.current.find((row) => row.event === activeGwId);
      const cost = transferCost(historyRow);
      const points = typeof officialPoints === "number" ? officialPoints + cost : officialPoints;
      return {
        ...manager,
        points,
        transferCost: cost,
        squidPoints: points,
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
        <span>⚡ Transfer hits included in official FPL GW score</span>
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
            <p>These managers are tied for the lowest score. No elimination is applied until the tie is resolved.</p>
            {pendingTie.managers.map((manager) => (
              <div className="simpleRow" key={manager.entry}>
                <div><a className="teamLink" href={`https://fantasy.premierleague.com/en/entry/${manager.entry}/event/${activeEvent.id}`} target="_blank" rel="noreferrer"><b>{manager.team}</b><small>{manager.manager}</small></a></div>
                <strong>{manager.points} - {manager.transferCost} = {manager.squidPoints}</strong>
              </div>
            ))}
          </div>
        </article>
      )}

      {liveGwActive && (
        <article className="card liveCard">
          <div className="cardHead">
            <h2>🔴 Gameweek {activeGwId} Live Survival</h2>
            <span>auto 60s</span>
          </div>
          {liveRows.length > 0 ? (
            <div className="tableWrap noMax">
              <table>
                <thead>
                  <tr><th>Zone</th><th>Team / Manager</th><th>Points</th><th>Transfer Cost</th><th>Squid</th></tr>
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
                  <strong>{elimination.points} - {elimination.transferCost} = {elimination.squidPoints}</strong>
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
