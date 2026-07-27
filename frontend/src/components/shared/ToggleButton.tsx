export function ToggleButton<T extends string>(props: {
  value: T;
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      className={props.selected === props.value ? "segmentButton activeSegment" : "segmentButton"}
      onClick={() => props.onSelect(props.value)}
      type="button"
    >
      {props.value}
    </button>
  );
}
