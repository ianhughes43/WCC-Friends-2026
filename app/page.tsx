import Countdown from "./Countdown";
import SquidGame from "./SquidGame";
import { getBootstrap, getFixtures, getLeague } from "./fpl";

export const dynamic = "force-dynamic";

const leagueId = process.env.FPL_LEAGUE_ID || "658721";
const joinCode = process.env.NEXT_PUBLIC_FPL_JOIN_CODE || "qkq9x5";

function movement(rank: number, last: number) {
  if (!last || rank === last) return { symbol: "—", cls: "flat" };
  if (rank < last) return { symbol: `▲ ${last - rank}`, cls: "up" };
  return { symbol: `▼ ${rank - last}`, cls: "down" };
}

function formatKickoff(iso: string | null) {
  if (!iso) return "TBC";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(iso));
}

export default async function Home() {
  try {
    const [bootstrap, league] = await Promise.all([getBootstrap(), getLeague(leagueId)]);
    const current = bootstrap.events.find((e) => e.is_current) || bootstrap.events.find((e) => e.is_next) || bootstrap.events[0];
    const nextEvent = bootstrap.events.find((e) => e.is_next) || current;
    const fixtures = await getFixtures(current.id);
    const teamMap = new Map(bootstrap.teams.map((t) => [t.id, t]));
    const top = league.standings.slice(0, 5);
    const biggestMover = [...league.standings].sort((a, b) => (b.last_rank - b.rank) - (a.last_rank - a.rank))[0];
    const averageGw = league.standings.length
      ? Math.round(league.standings.reduce((sum, x) => sum + (x.event_total || 0), 0) / league.standings.length)
      : 0;
    const risers = bootstrap.elements.filter((p) => p.cost_change_event > 0).sort((a, b) => b.cost_change_event - a.cost_change_event).slice(0, 6);
    const fallers = bootstrap.elements.filter((p) => p.cost_change_event < 0).sort((a, b) => a.cost_change_event - b.cost_change_event).slice(0, 6);

    return (
      <main className="shell">
        <header className="header">
          <div>
            <div className="eyebrow">FANTASY PREMIER LEAGUE</div>
            <h1>{league.league.name}</h1>
            <p>Live mini-league tracker · League #{leagueId}</p>
          </div>
          <a className="join" href={`https://fantasy.premierleague.com/leagues/auto-join/${joinCode}`} target="_blank" rel="noreferrer">Join League ↗</a>
        </header>

        <section className="heroGrid">
          <article className="card deadlineCard">
            <div className="cardHead"><h2>Next Deadline</h2><span>⏱</span></div>
            <h3>{nextEvent.name}</h3>
            <p>{new Date(nextEvent.deadline_time).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })} UK</p>
            <Countdown deadline={nextEvent.deadline_time} />
          </article>

          <article className="card statCard">
            <div><span className="miniLabel">League average</span><strong>{averageGw}</strong><small>{current.name} pts</small></div>
      <div><span className="miniLabel">Biggest mover</span><strong>{biggestMover && biggestMover.last_rank > biggestMover.rank ? `▲ ${biggestMover.last_rank - biggestMover.rank}` : "—"}</strong><small>{biggestMover && biggestMover.last_rank > biggestMover.rank ? biggestMover.entry_name : "No rank changes yet"}</small></div>
      
          </article>
        </section>

        <section className="grid2">
          <article className="card">
            <div className="cardHead"><h2>League Standings</h2><span>Live</span></div>
            <div className="tableWrap">
              <table>
                <thead><tr><th>#</th><th>Team / Manager</th><th>GW</th><th>Total</th><th>gw Move</th></tr></thead>
                <tbody>
                  {league.standings.map((row) => {
                    const mv = movement(row.rank, row.last_rank);
                    return <tr key={row.entry}>
                      <td className="rank">{row.rank}</td>
                      <td><a className="teamLink" href={`https://fantasy.premierleague.com/entry/${row.entry}/event/${current.id}`} target="_blank" rel="noreferrer"><b>{row.entry_name}</b><small>{row.player_name}</small></a></td>
                      <td>{row.event_total ?? "—"}</td>
                      <td><b>{row.total}</b></td>
                      <td><span className={mv.cls}>{mv.symbol}</span></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </article>

          <div className="stack">
            <article className="card">
              <div className="cardHead"><h2>{current.name} Fixtures</h2><span>{fixtures.filter(f => f.finished).length}/{fixtures.length}</span></div>
              <div className="fixtures">
                {fixtures.map((f) => {
                  const home = teamMap.get(f.team_h);
                  const away = teamMap.get(f.team_a);
                  return <div className="fixture" key={f.id}>
                    <span>{home?.short_name || f.team_h}</span>
                    <strong>{f.started ? `${f.team_h_score ?? 0} – ${f.team_a_score ?? 0}` : formatKickoff(f.kickoff_time)}</strong>
                    <span>{away?.short_name || f.team_a}</span>
                  </div>;
                })}
              </div>
        
          </div>
        </section>

    
    



<SquidGame leagueId={leagueId} />


        <footer>Data refreshes from the public Fantasy Premier League endpoints. This project is unofficial and not affiliated with the Premier League.</footer>
      </main>
    );
  } catch (error) {
    return <main className="shell"><article className="card error"><h1>FPL Tracker</h1><p>Could not load league #{leagueId}. The FPL API may be temporarily unavailable or the league may not be publicly accessible.</p><pre>{error instanceof Error ? error.message : "Unknown error"}</pre></article></main>;
  }
}
