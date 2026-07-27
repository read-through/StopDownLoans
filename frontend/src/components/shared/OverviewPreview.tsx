export function OverviewPreview(props: {
  title: string;
  primary: string;
  secondary: string;
  action: string;
  href: string;
}) {
  return (
    <article className="overviewPreview">
      <div>
        <div className="overviewPreviewTitle">{props.title}</div>
        <h2>{props.primary}</h2>
        <p>{props.secondary}</p>
      </div>
      <a className="ghostButton" href={props.href}>
        {props.action}
      </a>
    </article>
  );
}
