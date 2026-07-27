import { Progress } from "./Progress";
export function ReadinessMetric(props: { label: string; value: number }) {
  return (
    <div className="readinessMetric">
      <span>{props.label}</span>
      <Progress label={props.label} value={props.value} />
    </div>
  );
}
