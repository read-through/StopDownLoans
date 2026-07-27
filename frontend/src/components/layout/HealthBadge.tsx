import type { ApiHealth } from "../../api";
import { frontendContracts } from "../../config";
import {
  getBackendContractMismatch,
  getMissingFrontendCoreContracts,
} from "../../lib/mappers";

export function HealthBadge(props: {
  expectedChainId: number;
  expectedContracts: typeof frontendContracts;
  health: ApiHealth | null;
  status: "loading" | "loaded" | "error";
  error: string | null;
}) {
  const missingFrontendContracts = getMissingFrontendCoreContracts(props.expectedContracts);
  if (missingFrontendContracts.length > 0) {
    const label = `Missing frontend env: ${missingFrontendContracts.join(", ")}`;

    return (
      <span
        aria-label={label}
        className="healthBadge healthError"
        title={label}
      >
        Frontend config missing
      </span>
    );
  }

  if (props.status === "loading") {
    return <span aria-label="API health loading" className="healthBadge healthLoading">Checking API</span>;
  }

  if (props.status === "error" || props.health === null) {
    const label = props.error ?? "API unavailable";

    return <span aria-label={label} className="healthBadge healthError" title={label}>API offline</span>;
  }

  if (props.health.chainId !== props.expectedChainId) {
    const label = `Frontend expects chain ${props.expectedChainId}, backend reports chain ${props.health.chainId}`;

    return (
      <span
        aria-label={label}
        className="healthBadge healthError"
        title={label}
      >
        Chain mismatch
      </span>
    );
  }

  const contractMismatch = getBackendContractMismatch(props.expectedContracts, props.health);
  if (contractMismatch !== null) {
    const label = `${contractMismatch.label}: frontend ${contractMismatch.frontendValue}, backend ${contractMismatch.backendValue}`;

    return (
      <span
        aria-label={label}
        className="healthBadge healthError"
        title={label}
      >
        Contract mismatch
      </span>
    );
  }

  if (props.health.sync.status === "unavailable") {
    const label = props.health.sync.error.length === 0
      ? "ARC RPC sync status is unavailable."
      : props.health.sync.error;

    return (
      <span
        aria-label={`API ok. ARC chain ${props.health.chainId}. Sync unavailable: ${label}`}
        className="healthBadge healthLoading"
        title={label}
      >
        ARC {props.health.chainId} / RPC degraded
      </span>
    );
  }

  const syncLabel =
    props.health.sync.lagBlocks === null
      ? "not indexed"
      : `${props.health.sync.lagBlocks} block lag`;

  return (
    <span
      aria-label={`API ok. ARC chain ${props.health.chainId}. Sync ${syncLabel}. Latest block ${props.health.sync.latestBlock}. Indexed block ${props.health.sync.lastIndexedBlock ?? "none"}. Executor ${props.health.executorEnabled ? "enabled" : "disabled"}. Confirmation depth ${props.health.confirmationDepth}.`}
      className="healthBadge healthOk"
      title={`Chain ${props.health.chainId} / latest ${props.health.sync.latestBlock} / indexed ${props.health.sync.lastIndexedBlock ?? "none"} / executor ${props.health.executorEnabled ? "enabled" : "disabled"} / confirmations ${props.health.confirmationDepth}`}
    >
      ARC {props.health.chainId} / {syncLabel}
    </span>
  );
}
