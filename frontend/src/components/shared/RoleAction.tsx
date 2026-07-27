import { ArrowRight } from "lucide-react";
export function RoleAction(props: { title: string; text: string; action: string; href: string }) {
  return (
    <article className="roleAction">
      <div>
        <h2>{props.title}</h2>
        <p>{props.text}</p>
      </div>
      <a className="primaryButton" href={props.href}>
        {props.action}
        <ArrowRight size={17} />
      </a>
    </article>
  );
}
