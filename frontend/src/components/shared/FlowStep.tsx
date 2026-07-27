export function FlowStep(props: { title: string; text: string }) {
  return (
    <div className="flowStep">
      <div className="flowDot" />
      <div>
        <h3>{props.title}</h3>
        <p>{props.text}</p>
      </div>
    </div>
  );
}
