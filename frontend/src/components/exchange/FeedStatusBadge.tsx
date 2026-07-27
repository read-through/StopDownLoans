export function FeedStatusBadge(props: {
  status: "idle" | "connecting" | "connected" | "disconnected" | "error";
  error: string | null;
}) {
  const label =
    props.status === "connected"
      ? "Live"
      : props.status === "connecting"
        ? "Connecting"
        : props.status === "error"
          ? "Feed error"
          : "Offline";

  return (
    <span className={`feedBadge feed${props.status}`} title={props.error ?? label}>
      {label}
    </span>
  );
}
