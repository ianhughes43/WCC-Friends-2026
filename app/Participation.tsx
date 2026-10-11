export type Participation = { played: number; total: number; ft: number | null };

export function ParticipationCells({ value }: { value?: Participation }) {
  return <td className="participationCell" title="Scoring appearances / potential scoring appearances, including captain and chip multipliers">{value ? `${value.played}/${value.total}` : "—"}</td>;
}
