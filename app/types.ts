export type LeagueStanding = {
  id: number;
  event_total: number;
  player_name: string;
  rank: number;
  last_rank: number;
  rank_sort: number;
  total: number;
  entry: number;
  entry_name: string;
};

export type LeagueResponse = {
  league: {
    id: number;
    name: string;
    created: string;
    closed: boolean;
    max_entries: number | null;
    rank: number | null;
  };
  standings: {
    has_next: boolean;
    page: number;
    results: LeagueStanding[];
  };
};

export type FplEvent = {
  id: number;
  name: string;
  deadline_time: string;
  finished: boolean;
  is_previous: boolean;
  is_current: boolean;
  is_next: boolean;
  average_entry_score: number;
  highest_score: number | null;
};

export type FplTeam = {
  id: number;
  name: string;
  short_name: string;
};

export type FplElement = {
  id: number;
  web_name: string;
  team: number;
  now_cost: number;
  cost_change_event: number;
  cost_change_start: number;
  selected_by_percent: string;
};

export type Bootstrap = {
  events: FplEvent[];
  teams: FplTeam[];
  elements: FplElement[];
};

export type Fixture = {
  id: number;
  event: number | null;
  kickoff_time: string | null;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  finished: boolean;
  started: boolean;
};

export type EntryHistoryRow = {
  event: number;
  points: number;
  total_points: number;
  rank: number | null;
  rank_sort: number | null;
  overall_rank: number | null;
  bank: number;
  value: number;
  event_transfers: number;
  event_transfers_cost: number;
  points_on_bench: number;
};

export type EntryHistoryResponse = {
  current: EntryHistoryRow[];
  past: unknown[];
  chips: unknown[];
};

export type EntryEventPicksResponse = {
  active_chip: string | null;
  automatic_subs: unknown[];
  entry_history: EntryHistoryRow;
  picks: {
    element: number;
    position: number;
    multiplier: number;
    is_captain: boolean;
    is_vice_captain: boolean;
  }[];
};
