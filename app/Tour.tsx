import { EntryHistoryResponse, FplEvent, LeagueStanding } from "./types";

type HistoryBundle = {
  manager: LeagueStanding;
  history: EntryHistoryResponse;
};

type TourProps = {
  standings: LeagueStanding[];
  events: FplEvent[];
  currentEvent: FplEvent;
  histories: HistoryBundle[];
  liveScores: Record<number, number>;
};

type Major = {
  id: number;
  name: string;
  gw1: number;
  gw2: number;
};

type MajorRow = {
  entry: number;
  team: string;
  manager: string;
  overallRank: number;
  gw1: number | null;
  gw2: number | null;
  total: number | null;
};

const MAJORS: Major[] = [
  { id: 1, name: "Major 1", gw1: 6, gw2: 7 },
  { id: 2, name: "Major 2", gw1: 13, gw2: 14 },
  { id: 3, name: "Major 3", gw1: 23, gw2: 24 },
  { id: 4, name: "Major 4", gw1: 31, gw2: 32 },
];

const TOUR_POINTS = [10, 7, 5, 3, 2, 1];

function eventFinished(events: FplEvent[], gw: number) {
  return events.find((event) => event.id === gw)?.finished ?? false;
}

function getScore(
  bundle: HistoryBundle,
  gw: number,
  currentEvent: FplEvent,
  liveScores: Record<number, number>
) {
  if (gw === currentEvent.id && !currentEvent.finished && typeof liveScores[bundle.manager.entry] === "number") {
    return liveScores[bundle.manager.entry];
  }
  return bundle.history.current.find((row) => row.event === gw)?.points ?? null;
}

function rankMajor(rows: MajorRow[]) {
  return [...rows]
    .filter((row) => row.total !== null)
    .sort((a, b) => {
      const totalDiff = (b.total ?? -1) - (a.total ?? -1);
      if (totalDiff) return totalDiff;
      const gw2Diff = (b.gw2 ?? -1) - (a.gw2 ?? -1);
      if (gw2Diff) return gw2Diff;
      return a.overallRank - b.overallRank;
    });
}

function unresolvedTopSixTie(rows: MajorRow[]) {
  const ranked = rankMajor(rows);
  for (let i = 0; i < Math.min(ranked.length - 1, 6); i += 1) {
    const a = ranked[i];
    const b = ranked[i + 1];
    if (a.total === b.total && a.gw2 === b.gw2) return true;
  }
  return false;
}

export default function Tour({ standings, events, currentEvent, histories, liveScores }: TourProps) {
  const majorRows = MAJORS.map((major) => {
    const rows = histories.map((bundle) => {
      const gw1 = getScore(bundle, major.gw1, currentEvent, liveScores);
      const gw2 = getScore(bundle, major.gw2, currentEvent, liveScores);
      return {
        entry: bundle.manager.entry,
        team: bundle.manager.entry_name,
        manager: bundle.manager.player_name,
        overallRank: bundle.manager.rank,
        gw1,
        gw2,
        total: gw1 === null && gw2 === null ? null : (gw1 ?? 0) + (gw2 ?? 0),
      } satisfies MajorRow;
    });

    const finished = eventFinished(events, major.gw2);
    const started = rows.some((row) => row.gw1 !== null || row.gw2 !== null);
    const ranked = rankMajor(rows);
    const unresolvedTie = finished && unresolvedTopSixTie(rows);

    return { major, rows, ranked, finished, started, unresolvedTie };
  });

  const tourTable = standings.map((manager) => ({
    entry: manager.entry,
    team: manager.entry_name,
    manager: manager.player_name,
    overallRank: manager.rank,
    points: 0,
    wins: 0,
    seconds: 0,
    thirds: 0,
  }));

  const tableMap = new Map(tourTable.map((row) => [row.entry, row]));

  for (const result of majorRows) {
    if (!result.finished || result.unresolvedTie) continue;
    result.ranked.slice(0, 6).forEach((row, index) => {
      const tourRow = tableMap.get(row.entry);
      if (!tourRow) return;
      tourRow.points += TOUR_POINTS[index];
      if (index === 0) tourRow.wins += 1;
      if (index === 1) tourRow.seconds += 1;
      if (index === 2) tourRow.thirds += 1;
    });
  }

  const rankedTour = [...tourTable].sort((a, b) =>
    b.points - a.points ||
    b.wins - a.wins ||
    b.seconds - a.seconds ||
    b.thirds - a.thirds ||
    a.overallRank - b.overallRank
  );

  const currentMajor = majorRows.find((result) => result.started && !result.finished)
    || majorRows.find((result) => !result.started)
    || majorRows[majorRows.length - 1];

  return (
    <section className="competition tourCompetition">
      <div className="competitionHero tourHero">
        <div>
          <div className="eyebrow tourEyebrow">FOUR MAJORS · ONE CHAMPION</div>
          <h2>⛳ The Tour</h2>
          <p>Two-Gameweek Majors · Top 6 earn Tour Points</p>
        </div>
        <div className="heroNumber">
          <span>Prize Pot</span>
          <strong>£170</strong>
        </div>
      </div>

      <div className="ruleStrip tourRuleStrip">
        <span>🥇 10</span><span>🥈 7</span><span>🥉 5</span><span>4th 3</span><span>5th 2</span><span>6th 1</span>
      </div>

      <div className="majorCards">
        {majorRows.map((result) => {
          const leader = result.ranked[0];
          const status = result.finished ? "FINAL" : result.started ? "LIVE" : "UPCOMING";
          return (
            <article className="majorCard" key={result.major.id}>
              <div className="majorTop"><span>{result.major.name}</span><b className={`status ${status.toLowerCase()}`}>{status}</b></div>
              <strong>GW{result.major.gw1} + GW{result.major.gw2}</strong>
              <small>Winner £30</small>
              {leader && <p>{result.finished ? "🏆" : "Leader:"} {leader.team} · {leader.total} pts</p>}
            </article>
          );
        })}
      </div>

      {currentMajor && (
        <article className="card featureMajor">
          <div className="cardHead">
            <h2>{currentMajor.finished ? `${currentMajor.major.name} Final` : currentMajor.started ? `${currentMajor.major.name} Live` : `Next: ${currentMajor.major.name}`}</h2>
            <span>GW{currentMajor.major.gw1} + GW{currentMajor.major.gw2}</span>
          </div>

          {currentMajor.unresolvedTie && (
            <div className="tieNotice">⚠️ Exact tie remains after the second-Gameweek tiebreak. Tour Points are held until that tie is resolved.</div>
          )}

          {currentMajor.ranked.length ? (
            <div className="tableWrap noMax">
              <table>
                <thead>
                  <tr><th>#</th><th>Team / Manager</th><th>GW{currentMajor.major.gw1}</th><th>GW{currentMajor.major.gw2}</th><th>Total</th><th>Tour Pts</th></tr>
                </thead>
                <tbody>
                  {currentMajor.ranked.map((row, index) => (
                    <tr key={row.entry}>
                      <td className="rank">{index + 1}</td>
                      <td><b>{row.team}</b><small className="blockMuted">{row.manager}</small></td>
                      <td>{row.gw1 ?? "—"}</td>
                      <td>{row.gw2 ?? "—"}</td>
                      <td><b>{row.total ?? "—"}</b></td>
                      <td>{index < 6 ? <span className="tourPoints">+{TOUR_POINTS[index]}</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="emptyState">This Major has not started yet.</div>
          )}
        </article>
      )}

      <article className="card tourStandings">
        <div className="cardHead"><h2>Tour Standings</h2><span>Champion £50</span></div>
        <div className="tableWrap noMax">
          <table>
            <thead><tr><th>#</th><th>Team / Manager</th><th>Pts</th><th>Wins</th><th>2nds</th><th>3rds</th></tr></thead>
            <tbody>
              {rankedTour.map((row, index) => (
                <tr key={row.entry}>
                  <td className="rank">{index + 1}</td>
                  <td><b>{row.team}</b><small className="blockMuted">{row.manager}</small></td>
                  <td><b>{row.points}</b></td>
                  <td>{row.wins}</td>
                  <td>{row.seconds}</td>
                  <td>{row.thirds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card tourRules">
        <div className="cardHead"><h2>Tour Tiebreakers</h2><span>In order</span></div>
        <div className="rulesBody">
          <span>1️⃣ Most Major wins</span>
          <span>2️⃣ Most 2nd-place finishes</span>
          <span>3️⃣ Most 3rd-place finishes</span>
          <span>4️⃣ Overall FPL position after Major 4</span>
          <p>Major ties are decided by the higher score in the second Gameweek.</p>
        </div>
      </article>
    </section>
  );
}
