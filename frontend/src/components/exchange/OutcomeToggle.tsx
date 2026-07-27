import type { Outcome } from "../../types";
import { ToggleButton } from "../shared/ToggleButton";

export function OutcomeToggle(props: {
  selected: Outcome;
  onSelect: (outcome: Outcome) => void;
}) {
  return (
    <div className="segmentedControl" aria-label="Outcome">
      {(["YES", "NO"] as const).map((outcome) => (
        <button
          className={props.selected === outcome ? "segmentButton activeSegment" : "segmentButton"}
          key={outcome}
          onClick={() => props.onSelect(outcome)}
          type="button"
        >
          {outcome}
        </button>
      ))}
    </div>
  );
}
