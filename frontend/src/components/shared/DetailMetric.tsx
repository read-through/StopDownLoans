export function DetailMetric(props: { label: string; value: string }) {
  return (
    <div className="detailMetric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
