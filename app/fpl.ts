import {
  Bootstrap,
  EntryEventPicksResponse,
  EntryHistoryResponse,
  Fixture,
  LeagueResponse,
  LeagueStanding,
} from "./types";

const BASE = "https://fantasy.premierleague.com/api";

async function fplFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    next: { revalidate: 60 },
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-GB,en;q=0.9",
      Referer: "https://fantasy.premierleague.com/",
    },
  });

  if (!response.ok) {
    throw new Error(`FPL API returned ${response.status} for ${path}`);
  }

  return response.json() as Promise<T>;
}

export async function getBootstrap() {
  const response = await fetch(`${BASE}/bootstrap-static/`, {
    cache: "no-store",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-GB,en;q=0.9",
      Referer: "https://fantasy.premierleague.com/",
    },
  });

  if (!response.ok) {
    throw new Error(`FPL API returned ${response.status} for /bootstrap-static/`);
  }

  return response.json() as Promise<Bootstrap>;
}

export async function getLeague(leagueId: string) {
  const first = await fplFetch<LeagueResponse>(
    `/leagues-classic/${leagueId}/standings/?page_standings=1`
  );
  const all: LeagueStanding[] = [...first.standings.results];

  let page = 1;
  let hasNext = first.standings.has_next;

  while (hasNext && page < 20) {
    page += 1;
    const next = await fplFetch<LeagueResponse>(
      `/leagues-classic/${leagueId}/standings/?page_standings=${page}`
    );
    all.push(...next.standings.results);
    hasNext = next.standings.has_next;
  }

  return { league: first.league, standings: all };
}

export async function getFixtures(eventId: number) {
  return fplFetch<Fixture[]>(`/fixtures/?event=${eventId}`);
}

export async function getEntryHistory(entryId: number) {
  return fplFetch<EntryHistoryResponse>(`/entry/${entryId}/history/`);
}

export async function getEntryEventPicks(entryId: number, eventId: number) {
  return fplFetch<EntryEventPicksResponse>(
    `/entry/${entryId}/event/${eventId}/picks/`
  );
}
