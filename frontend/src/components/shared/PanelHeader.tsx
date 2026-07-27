import type { ReactNode } from "react";

export function PanelHeader(props: { title: string; action: string; icon: ReactNode }) {
  return (
    <div className="panelHeader">
      <h2>{props.title}</h2>
      <span className="panelStatusChip">
        {props.icon}
        {props.action}
      </span>
    </div>
  );
}
