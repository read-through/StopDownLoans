export function Quote(props: { label: string; value: string }) {
  return (
    <div className="quote">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
