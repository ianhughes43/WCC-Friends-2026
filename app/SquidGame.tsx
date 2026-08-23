import { getBootstrap, getEntryHistory, getLeague } from "./fpl";

const SQUID_START_GW = 4;
const SQUID_FINAL_GW = 32;

type SquidGameProps = {
  leagueId: string;
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

export default async function SquidGame({ leagueId }: SquidGameProps) {
  const [bootstrap, leagueData] = await Promise.all([
    getBootstrap(),
    getLeague(leagueId),
  ]);

  const standings = leagueData.standings;

  const histories = await Promise.all(
    standings.map(async (manager) => ({
      manager,
      history: await getEntryHistory(manager.entry),
    }))
  );

  const completedSquidGws = bootstrap.events
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

    const lowestManagers = scores.filter(
      (result) => result.points === lowestScore
    );

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

      // Stop here until the league admin resolves the tie.
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

  const squidStarted = completedSquidGws.length > 0;

  return (
    <section
      style={{
        marginTop: "28px",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "22px",
        overflow: "hidden",
        background: "rgba(10, 30, 44, 0.72)",
      }}
    >
      <div style={{ padding: "24px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "12px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                opacity: 0.65,
              }}
            >
              Survival Competition
            </div>

            <h2 style={{ margin: "7px 0 5px", fontSize: "28px" }}>
              🦑 Squid Game
            </h2>

            <p style={{ margin: 0, opacity: 0.7 }}>
              GW4–GW32 · Lowest scorer eliminated each Gameweek
            </p>
          </div>

          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                opacity: 0.6,
              }}
            >
              Alive
            </div>

            <strong style={{ fontSize: "30px" }}>{aliveManagers.length}</strong>
          </div>
        </div>
      </div>

      {!squidStarted && (
        <div
          style={{
            padding: "20px 24px",
            borderTop: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <strong>Squid starts in Gameweek 4.</strong>
          <div style={{ marginTop: "6px", opacity: 0.7 }}>
            All {standings.length} current league managers are still alive.
          </div>
        </div>
      )}

      {pendingTie && (
        <div
          style={{
            padding: "20px 24px",
            borderTop: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <strong>⚠️ Admin decision required — GW{pendingTie.gw}</strong>

          <div style={{ marginTop: "6px", opacity: 0.75 }}>
            Lowest score: {pendingTie.points} points
          </div>

          <div style={{ marginTop: "14px" }}>
            {pendingTie.managers.map((manager) => (
              <div key={manager.entry} style={{ marginBottom: "8px" }}>
                <strong>{manager.team}</strong>
                <span style={{ opacity: 0.65 }}> — {manager.manager}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "10px", opacity: 0.65 }}>
            No elimination has been applied until the league admin chooses who
            goes out.
          </div>
        </div>
      )}

      {eliminations.length > 0 && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.1)",
            padding: "20px 24px",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Elimination History</h3>

          {eliminations
            .slice()
            .reverse()
            .map((elimination) => (
              <div
                key={`${elimination.gw}-${elimination.entry}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "55px 1fr auto",
                  gap: "12px",
                  padding: "12px 0",
                  borderTop: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <strong>GW{elimination.gw}</strong>

                <div>
                  <strong>{elimination.team}</strong>
                  <div style={{ opacity: 0.6, fontSize: "13px" }}>
                    {elimination.manager}
                  </div>
                </div>

                <strong>{elimination.points} pts</strong>
              </div>
            ))}
        </div>
      )}

      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.1)",
          padding: "20px 24px",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Still Alive</h3>

        <div
          style={{
            display: "grid",
            gap: "10px",
          }}
        >
          {aliveManagers.map((manager) => (
            <div
              key={manager.entry}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                padding: "11px 0",
                borderTop: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div>
                <strong>{manager.entry_name}</strong>
                <div style={{ opacity: 0.6, fontSize: "13px" }}>
                  {manager.player_name}
                </div>
              </div>

              <span style={{ opacity: 0.7 }}>ALIVE</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
