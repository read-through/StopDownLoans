export function Progress(props: { label: string; value: number }) {
  return (
    <div className="progressWrap" aria-label={`${props.label}: ${props.value}%`}>
      <div className="progressBar" style={{ width: `${props.value}%` }} />
      <span>{props.value}%</span>
    </div>
  );
}
