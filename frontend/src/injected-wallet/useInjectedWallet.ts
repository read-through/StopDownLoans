import { useEffect, useMemo, useState } from "react";
import { useConnect, useConnection, useConnectors, useSwitchChain } from "wagmi";
import { expectedArcChainIdNumber } from "../config";
import type { EthereumProvider, WalletAccount, WalletStatus } from "../wallet";

export type InjectedWalletOption = {
  id: string;
  name: string;
  icon?: string;
};

export function useInjectedWallet() {
  const connection = useConnection();
  const connectors = useConnectors();
  const connectMutation = useConnect();
  const switchMutation = useSwitchChain();
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (connection.status !== "connected") {
      setAccount(null);
      setProviderError(null);
      return () => {
        cancelled = true;
      };
    }

    const { address, chainId, connector } = connection;
    connector
      .getProvider()
      .then((provider) => {
        if (cancelled) return;
        setAccount({
          kind: "injected",
          address,
          chainId: `0x${chainId.toString(16)}`,
          provider: provider as EthereumProvider,
        });
        setProviderError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setAccount(null);
        setProviderError(message(error, "Failed to access the connected wallet provider"));
      });

    return () => {
      cancelled = true;
    };
  }, [connection.address, connection.chainId, connection.connector, connection.isConnected]);

  const options = useMemo<InjectedWalletOption[]>(
    () => connectors.map((connector) => ({ id: connector.uid, name: connector.name, icon: connector.icon })),
    [connectors],
  );

  const status: WalletStatus =
    connectMutation.isPending || switchMutation.isPending || connection.isConnecting || connection.isReconnecting
      ? "connecting"
      : providerError !== null || connectMutation.error !== null || switchMutation.error !== null
        ? "error"
        : account !== null
          ? "connected"
          : connectors.length === 0
            ? "unavailable"
            : "disconnected";

  const error =
    providerError ??
    (connectMutation.error === null ? null : message(connectMutation.error, "Failed to connect wallet")) ??
    (switchMutation.error === null ? null : message(switchMutation.error, "Failed to switch wallet to ARC"));

  const connect = async (connectorId?: string) => {
    const connector = connectorId === undefined
      ? connectors[0]
      : connectors.find((candidate) => candidate.uid === connectorId);
    if (connector === undefined) {
      throw new Error("No injected EVM wallet detected. Install or enable an EVM wallet in this browser.");
    }

    await connectMutation.mutateAsync({ connector, chainId: expectedArcChainIdNumber });
  };

  const switchToArc = async () => {
    await switchMutation.mutateAsync({ chainId: expectedArcChainIdNumber });
  };

  return {
    account,
    status,
    error,
    options,
    connect,
    switchToArc,
  };
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
