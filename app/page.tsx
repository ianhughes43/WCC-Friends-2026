import AutoRefresh from "./AutoRefresh";
import CompetitionTabs from "./CompetitionTabs";
import Countdown from "./Countdown";
import SquidGame from "./SquidGame";
import Tour from "./Tour";
import { getBootstrap, getEntryEventPicks, getEntryHistory, getLeague } from "./fpl";

export const dynamic = "force-dynamic";

const leagueId = process.env.FPL_LEAGUE_ID || "658721";
const joinCode = process.env.NEXT_PUBLIC_FPL_JOIN_CODE || "qkq9x5";

function movement(rank: number, last: number) {
  if (!last || last <= 0 || rank === last) return { symbol: "—", cls: "flat" };
  if (rank < last) return { symbol: `▲ ${last - rank}`, cls: "up" };
  return { symbol: `▼ ${rank - last}`, cls: "down" };
}

export default async function Home() {
  try {
    const [bootstrap, league] = await Promise.all([
      getBootstrap(),
      getLeague(leagueId),
    ]);

    const current =
      bootstrap.events.find((event) => event.is_current) ||
      bootstrap.events.find((event) => event.is_next) ||
      bootstrap.events[0];
    const nextEvent = bootstrap.events.find((event) => event.is_next) || current;

    const histories = await Promise.all(
      league.standings.map(async (manager) => ({
        manager,
        history: await getEntryHistory(manager.entry),
      }))
    );

    const liveScorePairs = await Promise.all(
      league.standings.map(async (manager) => {
        try {
          const picks = await getEntryEventPicks(manager.entry, current.id);
          return [manager.entry, picks.entry_history.points] as const;
        } catch {
          return [manager.entry, null] as const;
        }
      })
    );

    const liveScores = Object.fromEntries(
      liveScorePairs.filter((pair): pair is readonly [number, number] => pair[1] !== null)
    );

    const movers = league.standings
      .map((row) => ({ ...row, move: row.last_rank > 0 ? row.last_rank - row.rank : 0 }))
      .sort((a, b) => b.move - a.move);
    const biggestMover = movers[0];
    const biggestMove = biggestMover?.move ?? 0;
    const averageGw = league.standings.length
      ? Math.round(
          league.standings.reduce((sum, row) => sum + (row.event_total || 0), 0) /
            league.standings.length
        )
      : 0;

    const overall = (
      <section className="competition overallCompetition">
        <section className="heroGrid">
          <article className="card deadlineCard">
            <div className="cardHead"><h2>Next Deadline</h2><span>⏱</span></div>
            <h3>{nextEvent.name}</h3>
            <p>{new Date(nextEvent.deadline_time).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })} UK</p>
            <Countdown deadline={nextEvent.deadline_time} />
          </article>

          <article className="card statCard twoStats">
            <div><span className="miniLabel">League average</span><strong>{averageGw}</strong><small>{current.name} pts</small></div>
            <div><span className="miniLabel">Biggest mover</span><strong>{biggestMove > 0 ? `▲ ${biggestMove}` : "—"}</strong><small>{biggestMove > 0 ? `${biggestMover?.entry_name} · ${biggestMover?.player_name}` : "No rank changes yet"}</small></div>
          </article>
        </section>

        <article className="card">
          <div className="cardHead"><h2>League Standings</h2><span>Live · auto 60s</span></div>
          <div className="tableWrap standingsTable">
            <table>
              <thead><tr><th>#</th><th>Team / Manager</th><th>GW</th><th>Total</th><th>Move</th></tr></thead>
              <tbody>
                {league.standings.map((row) => {
                  const mv = movement(row.rank, row.last_rank);
                  return (
                    <tr key={row.entry}>
                      <td className={`rank ${row.rank <= 3 ? "prizeRank" : ""}`}>
                        {row.rank === 1 ? <><span className="rankPlace">🥇 1st</span><span className="rankPrize">£200</span></> :
                         row.rank === 2 ? <><span className="rankPlace">🥈 2nd</span><span className="rankPrize">£100</span></> :
                         row.rank === 3 ? <><span className="rankPlace">🥉 3rd</span><span className="rankPrize">£30</span></> : row.rank}
                      </td>
                      <td><a className="teamLink" href={`https://fantasy.premierleague.com/entry/${row.entry}/event/${current.id}`} target="_blank" rel="noreferrer"><b>{row.entry_name}</b><small>{row.player_name}</small></a></td>
                      <td>{row.event_total ?? "—"}</td>
                      <td><b>{row.total}</b></td>
                      <td><span className={mv.cls}>{mv.symbol}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    );

    const squid = (
      <SquidGame
        standings={league.standings}
        events={bootstrap.events}
        currentEvent={current}
        histories={histories}
        liveScores={liveScores}
      />
    );

    const tour = (
      <Tour
        standings={league.standings}
        events={bootstrap.events}
        currentEvent={current}
        histories={histories}
        liveScores={liveScores}
      />
    );

    return (
      <main className="shell">
        <AutoRefresh intervalMs={60_000} />

        <header className="header">
          <div>
            <div className="eyebrow">FANTASY PREMIER LEAGUE 2026/27</div>
            <h1>{league.league.name}</h1>
            <p>£600 prize pot · League #{leagueId}</p>
          </div>
          <a className="join" href={`https://fantasy.premierleague.com/leagues/auto-join/${joinCode}`} target="_blank" rel="noreferrer">Join League ↗</a>
        </header>

        <CompetitionTabs overall={overall} squid={squid} tour={tour} />

        <footer>Unofficial FPL companion for Willoughby Cricket &amp; Friends. Scores refresh from the public Fantasy Premier League endpoints.</footer>
      </main>
    );
  } catch (error) {
    return (
      <main className="shell">
        <article className="card error">
          <h1>FPL Tracker</h1>
          <p>Could not load league #{leagueId}. The FPL API may be temporarily unavailable or the league may not be publicly accessible.</p>
          <pre>{error instanceof Error ? error.message : "Unknown error"}</pre>
        </article>
      </main>
    );
  }
}
