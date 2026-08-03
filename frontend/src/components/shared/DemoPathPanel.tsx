import { ArrowRight, BadgeCheck, MonitorPlay, RadioTower } from "lucide-react";

const demoSteps = [
  {
    title: "Protocol proof",
    text: "Run the local happy path to verify lending, YES/NO resolution, claims, and CLOB settlement.",
    command: "npm.cmd run demo:happy-path",
    icon: BadgeCheck,
  },
  {
    title: "UI walkthrough",
    text: "Use the demo API and mock wallet to inspect borrower, lender, trader, and portfolio screens.",
    command: "npm.cmd run demo:frontend",
    icon: MonitorPlay,
  },
  {
    title: "ARC readiness",
    text: "Check the live ARC backend, deployed contracts, executor permission, and market feed.",
    command: "npm.cmd run arc:live-check",
    icon: RadioTower,
  },
];

export function DemoPathPanel() {
  return (
    <section className="demoPathPanel" aria-label="Reviewer demo path">
      <div className="demoPathIntro">
        <span>Final demo path</span>
        <h2>Verify the product in three passes</h2>
        <p>
          Start with deterministic protocol behavior, then inspect the app, then confirm the ARC-backed stack is ready
          for a real wallet.
        </p>
      </div>
      <div className="demoPathSteps">
        {demoSteps.map((step, index) => {
          const Icon = step.icon;
          return (
            <article className="demoPathStep" key={step.title}>
              <div className="demoStepNumber">{index + 1}</div>
              <div className="demoStepIcon">
                <Icon size={18} />
              </div>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <code>{step.command}</code>
              </div>
            </article>
          );
        })}
      </div>
      <a className="demoPathLink" href="#loans">
        Start from loan opportunities
        <ArrowRight size={17} />
      </a>
    </section>
  );
}
