import { Bootstrap, Fixture, LeagueResponse, LeagueStanding } from "./types";

const BASE = "https://fantasy.premierleague.com/api";
const cacheOptions = { next: { revalidate: 60 } } as const;

async function fplFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...cacheOptions,
    headers: { "User-Agent": "FPL-League-Tracker/1.0" },
  });
  if (!response.ok) throw new Error(`FPL API returned ${response.status} for ${path}`);
  return response.json() as Promise<T>;
}

export async function getBootstrap() {
  return fplFetch<Bootstrap>("/bootstrap-static/");
}

export async function getLeague(leagueId: string) {
  const first = await fplFetch<LeagueResponse>(`/leagues-classic/${leagueId}/standings/?page_standings=1`);
  const all: LeagueStanding[] = [...first.standings.results];

  let page = 1;
  let hasNext = first.standings.has_next;
  while (hasNext && page < 20) {
    page += 1;
    const next = await fplFetch<LeagueResponse>(`/leagues-classic/${leagueId}/standings/?page_standings=${page}`);
    all.push(...next.standings.results);
    hasNext = next.standings.has_next;
  }

  return { league: first.league, standings: all };
}

export async function getFixtures(eventId: number) {
  return fplFetch<Fixture[]>(`/fixtures/?event=${eventId}`);
}
export type EntryHistoryRow = {
  event: number;
  points: number;
  total_points: number;
  overall_rank: number;
  points_on_bench: number;
};

type EntryHistoryResponse = {
  current: EntryHistoryRow[];
};

export async function getEntryHistory(entryId: number) {
  return fplFetch<EntryHistoryResponse>(`/entry/${entryId}/history/`);
}
