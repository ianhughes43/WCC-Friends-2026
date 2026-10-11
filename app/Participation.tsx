export type Participation = { played: number; total: number; ft: number | null };

export function ParticipationCells({ value }: { value?: Participation }) {
  return <>
    <td className="participationCell" title="Completed scoring appearances / potential scoring appearances, including captain and chip multipliers">{value ? `${value.played}/${value.total}` : "—"}</td>
    <td className="participationCell" title="Estimated free transfers carried into this Gameweek, based on public transfer history; not confirmed by FPL">{value?.ft == null ? "—" : `~${value.ft}`}</td>
  </>;
}
