export type Participation = { played: number; total: number; ft: number | null };

export function ParticipationCells({ value }: { value?: Participation }) {
  return <>
    <td className="participationCell" title="Completed scoring appearances / potential scoring appearances, including captain and chip multipliers">{value ? `${value.played}/${value.total}` : "—"}</td>
    <td className="participationCell" title="Estimated FT: start-of-GW during play, projected next-GW after GW finishes; not a confirmed live balance">{value?.ft == null ? "—" : `${value.ft}`}</td>
  </>;
}
