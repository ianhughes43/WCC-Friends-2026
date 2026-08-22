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
