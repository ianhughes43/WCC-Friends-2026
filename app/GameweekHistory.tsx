"use client";

import { useMemo, useState } from "react";
import { EntryHistoryResponse, FplEvent, LeagueStanding } from "./types";

type History = { manager: LeagueStanding; history: EntryHistoryResponse };
type LiveProjection = { points: number; autoSubDelta: number } | null;

export default function GameweekHistory({ histories, events, currentGw, liveProjections }: { histories: History[]; events: FplEvent[]; currentGw: number; liveProjections: Record<number, LiveProjection> }) {
  const [view, setView] = useState<"rank" | "points">("rank");
  const [search, setSearch] = useState("");
  const weeks = useMemo(() => events.filter(e => e.id >= 1 && histories.some(h => h.history.current.some(r => r.event === e.id))).map(e => e.id).sort((a,b) => a-b), [events, histories]);
  const rows = useMemo(() => histories.map(({manager, history}) => ({manager, byGw: new Map(history.current.map(r => [r.event, r]))})), [histories]);
  // Rank within the current WCC league membership, using each manager's cumulative FPL points.
  // Shared totals receive the same league position (1, 2, 2, 4).
  const ranks = useMemo(() => {
    const result = new Map<number, Map<number, number>>();
    for (const gw of weeks) {
      const totals = rows.filter(r => r.byGw.has(gw)).map(r => {
        const record = r.byGw.get(gw)!;
        const projection = gw === currentGw ? liveProjections[r.manager.entry] : null;
        return { entry: r.manager.entry, total: record.total_points + (projection ? projection.points - record.points : 0) };
      }).sort((a,b) => b.total-a.total);
      const positions = new Map<number,number>();
      totals.forEach((r,i) => { positions.set(r.entry, i > 0 && r.total === totals[i-1].total ? positions.get(totals[i-1].entry)! : i+1); });
      result.set(gw,positions);
    }
    return result;
  }, [rows, weeks, currentGw, liveProjections]);
  const filtered = rows.filter(r => `${r.manager.entry_name} ${r.manager.player_name}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => a.manager.rank-b.manager.rank);
  return <section className="competition">
    <article className="card">
      <div className="cardHead"><h2>📊 Gameweek History</h2><span>WCC League · 30 managers</span></div>
      <div className="historyControls">
        <div className="historySwitch" role="group" aria-label="History view">
          <button type="button" className={view === "rank" ? "selected" : ""} onClick={() => setView("rank")}>League Rank</button>
          <button type="button" className={view === "points" ? "selected" : ""} onClick={() => setView("points")}>GW Points</button>
        </div>
        <input aria-label="Find manager" placeholder="Find manager or team…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <p className="historyNote">{view === "rank" ? "Position among the current WCC league managers after each Gameweek. Equal total points share a position." : "GW points after transfer hits. Current live Gameweek includes auto subs where available; earlier weeks use official FPL history."} Swipe sideways to see more Gameweeks.</p>
      <div className="tableWrap noMax historyTable"><table><thead><tr><th className="historyManager">Team / Manager</th>{weeks.map(gw => <th key={gw}>GW{gw}</th>)}</tr></thead>
      <tbody>{filtered.map(({manager,byGw}) => <tr key={manager.entry}><td className="historyManager"><a className="teamLink" href={`https://fantasy.premierleague.com/en/entry/${manager.entry}/history`} target="_blank" rel="noreferrer"><b>{manager.entry_name}</b><small>{manager.player_name}</small></a></td>{weeks.map(gw => { const row=byGw.get(gw); const projection = gw === currentGw ? liveProjections[manager.entry] : null; const n=view === "rank" ? ranks.get(gw)?.get(manager.entry) : row ? (projection?.points ?? row.points)-row.event_transfers_cost : undefined; return <td key={gw} className={view === "rank" && n === 1 ? "historyFirst" : ""}>{n == null ? "—" : view === "rank" ? `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}` : n}{view === "points" && projection ? <small className="autoSubStatus">Includes auto subs{projection.autoSubDelta !== 0 ? ` ${projection.autoSubDelta > 0 ? "+" : ""}${projection.autoSubDelta}` : " (0)"}</small> : null}</td>; })}</tr>)}</tbody></table></div>
    </article>
  </section>;
}
