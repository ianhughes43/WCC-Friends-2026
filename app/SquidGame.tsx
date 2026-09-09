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
};

type PendingTie = {
  gw: number;
  points: number;
  managers: {
    entry: number;
    team: string;
    manager: string;
  }[];
};

export default function SquidGame({
  standings,
  events,
  currentEvent,
  histories,
  liveScores,
}: SquidGameProps) {
  const completedSquidGws = events
    .filter(
      (event) =>
        event.finished &&
        event.id >= SQUID_START_GW &&
        event.id <= SQUID_FINAL_GW
    )
    .map((event) => event.id)
    .sort((a, b) => a - b);

  const alive = new Set(standings.map((manager) => manager.entry));
  const eliminations: Elimination[] = [];
  let pendingTie: PendingTie | null = null;

  for (const gw of completedSquidGws) {
    const scores = histories
      .filter(({ manager }) => alive.has(manager.entry))
      .map(({ manager, history }) => {
        const gwHistory = history.current.find((row) => row.event === gw);
        return {
          entry: manager.entry,
          team: manager.entry_name,
          manager: manager.player_name,
          points: gwHistory?.points ?? null,
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
        } => result.points !== null
      );

    if (!scores.length) continue;

    const lowestScore = Math.min(...scores.map((result) => result.points));
    const lowestManagers = scores.filter((result) => result.points === lowestScore);

    if (lowestManagers.length > 1) {
      pendingTie = {
        gw,
        points: lowestScore,
        managers: lowestManagers.map((result) => ({
          entry: result.entry,
          team: result.team,
          manager: result.manager,
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
    });
  }

  const aliveManagers = standings.filter((manager) => alive.has(manager.entry));
  const liveGwActive =
    currentEvent.id >= SQUID_START_GW &&
    currentEvent.id <= SQUID_FINAL_GW &&
    !currentEvent.finished &&
    !pendingTie;

  const liveRows = aliveManagers
    .map((manager) => ({
      ...manager,
      livePoints: liveScores[manager.entry],
    }))
    .filter((manager) => typeof manager.livePoints === "number")
    .sort((a, b) => a.livePoints - b.livePoints || a.rank - b.rank);

  const lowestLive = liveRows.length ? liveRows[0].livePoints : null;
  const hasStarted = completedSquidGws.length > 0 || currentEvent.id >= SQUID_START_GW;

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
        <span>⚡ Chips allowed</span>
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
                <div><b>{manager.team}</b><small>{manager.manager}</small></div>
                <strong>{pendingTie?.points} pts</strong>
              </div>
            ))}
          </div>
        </article>
      )}

      {liveGwActive && (
        <article className="card liveCard">
          <div className="cardHead">
            <h2>🔴 {currentEvent.name} Live Survival</h2>
            <span>auto 60s</span>
          </div>
          {liveRows.length > 0 ? (
            <div className="tableWrap noMax">
              <table>
                <thead>
                  <tr><th>Zone</th><th>Team / Manager</th><th>Live GW</th></tr>
                </thead>
                <tbody>
                  {liveRows.map((manager) => {
                    const danger = manager.livePoints === lowestLive;
                    return (
                      <tr className={danger ? "dangerRow" : ""} key={manager.entry}>
                        <td><span className={danger ? "dangerBadge" : "safeBadge"}>{danger ? "OUT" : "SAFE"}</span></td>
                        <td><b>{manager.entry_name}</b><small className="blockMuted">{manager.player_name}</small></td>
                        <td className="scoreCell"><b>{manager.livePoints}</b></td>
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
                <div><b>{manager.entry_name}</b><small>{manager.player_name}</small></div>
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
                  <div className="grow"><b>{elimination.team}</b><small>{elimination.manager}</small></div>
                  <strong>{elimination.points}</strong>
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
