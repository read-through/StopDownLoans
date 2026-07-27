import {
  Activity,
  CircleDollarSign,
  Clock3,
  LineChart,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  fetchBookSnapshot,
  fetchHealth,
  fetchLoanPositions,
  fetchLoans,
  fetchMarkets,
  fetchOrders,
  fetchReservations,
  fetchTrades,
  type ApiBookSnapshot,
  type ApiHealth,
  type ApiLoan,
  type ApiLoanPosition,
  type ApiMarketConfig,
  type ApiOrder,
  type ApiReservation,
  type ApiTrade,
} from "../api";
import { subscribeBookFeed } from "../bookFeed";
import { readWalletBalances, type WalletBalances } from "../chainReads";
import { expectedArcChainIdHex, expectedArcChainIdNumber, frontendContracts } from "../config";
import { errorMessage, formatTopbarTime, shortHex, walletButtonLabel, formatUsdc } from "../lib/format";
import {
  getMarketKey,
  toLoanDetail,
  toLoanOpportunity,
  toPredictionMarket,
} from "../lib/mappers";
import { getRouteFromHash, getScreenCopy, navigateToLoan, navigateToMarket, navigateToScreen } from "../navigation";
import type {
  AppScreen,
  LoanFilter,
  MarketFilter,
  Outcome,
} from "../types";
import {
  getConnectedWalletAccount,
  getInjectedWalletProvider,
  hasInjectedWallet,
  requestWalletAccount,
  subscribeWalletAccountsChanged,
  switchWalletChain,
  type WalletAccount,
  type WalletStatus,
} from "../wallet";

export function useAppController() {
  const [activeRoute, setActiveRoute] = useState(() => getRouteFromHash());
  const [loanViews, setLoanViews] = useState<ApiLoan[]>([]);
  const [loansStatus, setLoansStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [loansError, setLoansError] = useState<string | null>(null);
  const [loanNextCursor, setLoanNextCursor] = useState<string | null>(null);
  const [loanPageStatus, setLoanPageStatus] = useState<"idle" | "loading" | "error">("idle");
  const [loanPageError, setLoanPageError] = useState<string | null>(null);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [loanFilter, setLoanFilter] = useState<LoanFilter>("All");
  const [loansRefreshNonce, setLoansRefreshNonce] = useState(0);
  const [marketConfigs, setMarketConfigs] = useState<ApiMarketConfig[]>([]);
  const [marketsStatus, setMarketsStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [marketNextCursor, setMarketNextCursor] = useState<string | null>(null);
  const [marketPageStatus, setMarketPageStatus] = useState<"idle" | "loading" | "error">("idle");
  const [marketPageError, setMarketPageError] = useState<string | null>(null);
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [healthStatus, setHealthStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [healthError, setHealthError] = useState<string | null>(null);
  const [selectedMarketKey, setSelectedMarketKey] = useState<string | null>(null);
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("All");
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome>("YES");
  const [bookSnapshot, setBookSnapshot] = useState<ApiBookSnapshot | null>(null);
  const [bookStatus, setBookStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [bookError, setBookError] = useState<string | null>(null);
  const [recentTrades, setRecentTrades] = useState<ApiTrade[]>([]);
  const [tradesStatus, setTradesStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [tradesError, setTradesError] = useState<string | null>(null);
  const [tradesNextCursor, setTradesNextCursor] = useState<string | null>(null);
  const [tradesPageStatus, setTradesPageStatus] = useState<"idle" | "loading" | "error">("idle");
  const [tradesPageError, setTradesPageError] = useState<string | null>(null);
  const [feedStatus, setFeedStatus] = useState<"idle" | "connecting" | "connected" | "disconnected" | "error">("idle");
  const [feedError, setFeedError] = useState<string | null>(null);
  const [bookRefreshNonce, setBookRefreshNonce] = useState(0);
  const [walletAccount, setWalletAccount] = useState<WalletAccount | null>(null);
  const [walletStatus, setWalletStatus] = useState<WalletStatus>("checking");
  const [walletError, setWalletError] = useState<string | null>(null);
  const [openOrders, setOpenOrders] = useState<ApiOrder[]>([]);
  const [openOrdersStatus, setOpenOrdersStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [openOrdersError, setOpenOrdersError] = useState<string | null>(null);
  const [openOrdersNextCursor, setOpenOrdersNextCursor] = useState<string | null>(null);
  const [openOrdersPageStatus, setOpenOrdersPageStatus] = useState<"idle" | "loading" | "error">("idle");
  const [openOrdersPageError, setOpenOrdersPageError] = useState<string | null>(null);
  const [loanPositions, setLoanPositions] = useState<ApiLoanPosition[]>([]);
  const [loanPositionsStatus, setLoanPositionsStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [loanPositionsError, setLoanPositionsError] = useState<string | null>(null);
  const [loanPositionsNextCursor, setLoanPositionsNextCursor] = useState<string | null>(null);
  const [loanPositionsPageStatus, setLoanPositionsPageStatus] = useState<"idle" | "loading" | "error">("idle");
  const [loanPositionsPageError, setLoanPositionsPageError] = useState<string | null>(null);
  const [reservations, setReservations] = useState<ApiReservation[]>([]);
  const [reservationsStatus, setReservationsStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [reservationsError, setReservationsError] = useState<string | null>(null);
  const [accountRefreshNonce, setAccountRefreshNonce] = useState(0);
  const [walletBalances, setWalletBalances] = useState<WalletBalances | null>(null);
  const [walletBalancesStatus, setWalletBalancesStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [walletBalancesError, setWalletBalancesError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState(() => new Date());

  useEffect(() => {
    const syncHashScreen = () => {
      setActiveRoute(getRouteFromHash());
    };

    window.addEventListener("hashchange", syncHashScreen);
    return () => window.removeEventListener("hashchange", syncHashScreen);
  }, []);

  const activeScreen = activeRoute.screen;
  const routeLoanId = activeScreen === "loans" ? activeRoute.loanId : null;
  const routeMarketKey = activeScreen === "exchange" ? activeRoute.marketKey : null;

  useEffect(() => {
    if (routeLoanId === null) {
      return;
    }

    setLoanFilter("All");
    setSelectedLoanId(routeLoanId);
  }, [routeLoanId]);

  useEffect(() => {
    if (routeMarketKey === null) {
      return;
    }

    setMarketFilter("All");
    setSelectedMarketKey(routeMarketKey.toLowerCase());
  }, [routeMarketKey]);

  useEffect(() => {
    let cancelled = false;

    setLoansStatus("loading");
    setLoansError(null);
    setLoanPageStatus("idle");
    setLoanPageError(null);
    setMarketsStatus("loading");
    setMarketsError(null);
    setMarketPageStatus("idle");
    setMarketPageError(null);
    setHealthStatus("loading");
    setHealthError(null);

    fetchLoans()
      .then((response) => {
        if (cancelled) {
          return;
        }

        setLoanViews(response.loans);
        setLoanNextCursor(response.nextCursor);
        setLoansStatus("loaded");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setLoansError(error instanceof Error ? error.message : "Failed to load loans");
        setLoanNextCursor(null);
        setLoansStatus("error");
      });

    fetchMarkets()
      .then((response) => {
        if (cancelled) {
          return;
        }

        setMarketConfigs(response.markets);
        setMarketNextCursor(response.nextCursor);
        setMarketsStatus("loaded");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setMarketsError(error instanceof Error ? error.message : "Failed to load markets");
        setMarketNextCursor(null);
        setMarketsStatus("error");
      });

    fetchHealth()
      .then((response) => {
        if (cancelled) {
          return;
        }

        setHealth(response);
        setHealthError(null);
        setHealthStatus("loaded");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setHealth(null);
        setHealthError(error instanceof Error ? error.message : "Failed to load backend health");
        setHealthStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [loansRefreshNonce]);

  useEffect(() => {
    let cancelled = false;

    const refreshWallet = () => {
      if (!hasInjectedWallet()) {
        setWalletAccount(null);
        setWalletStatus("unavailable");
        setWalletError("No injected EVM wallet detected in this browser.");
        return;
      }

      getConnectedWalletAccount()
        .then((account) => {
          if (cancelled) {
            return;
          }

          setWalletAccount(account);
          setWalletStatus(account === null ? "disconnected" : "connected");
          setWalletError(null);
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          setWalletAccount(null);
          setWalletStatus("error");
          setWalletError(error instanceof Error ? error.message : "Failed to read wallet");
        });
    };

    refreshWallet();
    const unsubscribe = subscribeWalletAccountsChanged(refreshWallet);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (selectedMarketKey !== null || marketConfigs.length === 0) {
      return;
    }

    const firstMarket = marketConfigs[0];
    setSelectedMarketKey(getMarketKey(firstMarket.outcomeToken, firstMarket.marketId));
  }, [marketConfigs, selectedMarketKey]);

  useEffect(() => {
    if (selectedLoanId !== null || loanViews.length === 0) {
      return;
    }

    setSelectedLoanId(loanViews[0].loanId);
  }, [loanViews, selectedLoanId]);

  useEffect(() => {
    if (selectedMarketKey === null) {
      setBookSnapshot(null);
      setBookStatus("idle");
      setRecentTrades([]);
      setTradesStatus("idle");
      setTradesNextCursor(null);
      setTradesPageStatus("idle");
      setTradesPageError(null);
      return;
    }

    const selectedMarket = marketConfigs.find(
      (market) => getMarketKey(market.outcomeToken, market.marketId) === selectedMarketKey
    );
    if (selectedMarket === undefined) {
      setBookSnapshot(null);
      setBookStatus("idle");
      setRecentTrades([]);
      setTradesStatus("idle");
      setTradesNextCursor(null);
      setTradesPageStatus("idle");
      setTradesPageError(null);
      return;
    }

    let cancelled = false;
    setBookStatus("loading");
    setBookError(null);
    setTradesStatus("loading");
    setTradesError(null);
    setTradesNextCursor(null);
    setTradesPageStatus("idle");
    setTradesPageError(null);

    Promise.allSettled([
      fetchBookSnapshot({
        outcomeToken: selectedMarket.outcomeToken,
        marketId: selectedMarket.marketId,
        outcome: selectedOutcome,
      }),
      fetchTrades({
        outcomeToken: selectedMarket.outcomeToken,
        marketId: selectedMarket.marketId,
        outcome: selectedOutcome,
        limit: 8,
      }),
    ])
      .then(([bookResult, tradesResult]) => {
        if (cancelled) {
          return;
        }

        if (bookResult.status === "fulfilled") {
          setBookSnapshot(bookResult.value);
          setBookStatus("loaded");
        } else {
          setBookSnapshot(null);
          setBookError(errorMessage(bookResult.reason, "Failed to load orderbook"));
          setBookStatus("error");
        }

        if (tradesResult.status === "fulfilled") {
          setRecentTrades(tradesResult.value.trades);
          setTradesNextCursor(tradesResult.value.nextCursor);
          setTradesStatus("loaded");
        } else {
          setRecentTrades([]);
          setTradesNextCursor(null);
          setTradesError(errorMessage(tradesResult.reason, "Failed to load trades"));
          setTradesStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bookRefreshNonce, marketConfigs, selectedMarketKey, selectedOutcome]);

  useEffect(() => {
    const selectedMarket = marketConfigs.find(
      (market) => getMarketKey(market.outcomeToken, market.marketId) === selectedMarketKey
    );
    if (selectedMarket === undefined) {
      setFeedStatus("idle");
      setFeedError(null);
      return;
    }

    let refreshScheduled = false;
    return subscribeBookFeed({
      outcomeToken: selectedMarket.outcomeToken,
      marketId: selectedMarket.marketId,
      outcome: selectedOutcome,
      onUpdate: () => {
        if (refreshScheduled) {
          return;
        }

        refreshScheduled = true;
        window.setTimeout(() => {
          refreshScheduled = false;
          setBookRefreshNonce((value) => value + 1);
        }, 150);
      },
      onStatus: (status, error) => {
        setFeedStatus(status);
        setFeedError(error ?? null);
      },
    });
  }, [marketConfigs, selectedMarketKey, selectedOutcome]);

  useEffect(() => {
    if (walletAccount === null) {
      setOpenOrders([]);
      setOpenOrdersStatus("idle");
      setOpenOrdersError(null);
      setOpenOrdersNextCursor(null);
      setOpenOrdersPageStatus("idle");
      setOpenOrdersPageError(null);
      setLoanPositions([]);
      setLoanPositionsStatus("idle");
      setLoanPositionsError(null);
      setLoanPositionsNextCursor(null);
      setLoanPositionsPageStatus("idle");
      setLoanPositionsPageError(null);
      setReservations([]);
      setReservationsStatus("idle");
      setReservationsError(null);
      return;
    }

    let cancelled = false;
    setOpenOrdersStatus("loading");
    setOpenOrdersError(null);
    setOpenOrdersNextCursor(null);
    setOpenOrdersPageStatus("idle");
    setOpenOrdersPageError(null);
    setLoanPositionsStatus("loading");
    setLoanPositionsError(null);
    setLoanPositionsNextCursor(null);
    setLoanPositionsPageStatus("idle");
    setLoanPositionsPageError(null);
    setReservationsStatus("loading");
    setReservationsError(null);

    Promise.allSettled([
      fetchOrders({
        maker: walletAccount.address,
        status: "LIVE",
        limit: 10,
      }),
      fetchLoanPositions({
        account: walletAccount.address,
        limit: 10,
      }),
      fetchReservations({
        maker: walletAccount.address,
      }),
    ])
      .then(([ordersResult, positionsResult, reservationsResult]) => {
        if (cancelled) {
          return;
        }

        if (ordersResult.status === "fulfilled") {
          setOpenOrders(ordersResult.value.orders);
          setOpenOrdersNextCursor(ordersResult.value.nextCursor);
          setOpenOrdersStatus("loaded");
        } else {
          setOpenOrders([]);
          setOpenOrdersNextCursor(null);
          setOpenOrdersError(errorMessage(ordersResult.reason, "Failed to load open orders"));
          setOpenOrdersStatus("error");
        }

        if (positionsResult.status === "fulfilled") {
          setLoanPositions(positionsResult.value.positions);
          setLoanPositionsNextCursor(positionsResult.value.nextCursor);
          setLoanPositionsStatus("loaded");
        } else {
          setLoanPositions([]);
          setLoanPositionsNextCursor(null);
          setLoanPositionsError(errorMessage(positionsResult.reason, "Failed to load loan positions"));
          setLoanPositionsStatus("error");
        }

        if (reservationsResult.status === "fulfilled") {
          setReservations(reservationsResult.value.reservations);
          setReservationsStatus("loaded");
        } else {
          setReservations([]);
          setReservationsError(errorMessage(reservationsResult.reason, "Failed to load reservations"));
          setReservationsStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accountRefreshNonce, walletAccount]);

  const predictionMarkets = useMemo(
    () => marketConfigs.map(toPredictionMarket),
    [marketConfigs]
  );
  const filteredPredictionMarkets = useMemo(
    () =>
      marketFilter === "All"
        ? predictionMarkets
        : predictionMarkets.filter((market) => market.state === marketFilter),
    [marketFilter, predictionMarkets]
  );
  const selectedMarket = useMemo(
    () =>
      predictionMarkets.find(
        (market) => getMarketKey(market.outcomeToken, market.marketId) === selectedMarketKey
      ) ?? null,
    [predictionMarkets, selectedMarketKey]
  );

  useEffect(() => {
    if (filteredPredictionMarkets.length === 0) {
      if (marketsStatus === "loaded") {
        setSelectedMarketKey(null);
      }
      return;
    }

    const selectedMarketIsVisible = filteredPredictionMarkets.some(
      (market) => getMarketKey(market.outcomeToken, market.marketId) === selectedMarketKey
    );

    if (!selectedMarketIsVisible) {
      const firstMarket = filteredPredictionMarkets[0];
      setSelectedMarketKey(getMarketKey(firstMarket.outcomeToken, firstMarket.marketId));
    }
  }, [filteredPredictionMarkets, marketsStatus, selectedMarketKey]);
  const walletOnExpectedChain =
    walletAccount !== null &&
    walletAccount.chainId !== null &&
    walletAccount.chainId.toLowerCase() === expectedArcChainIdHex;
  const screenCopy = getScreenCopy(activeScreen);
  const loanOpportunities = useMemo(
    () => loanViews.map((loan) => toLoanOpportunity(loan, marketConfigs)),
    [loanViews, marketConfigs]
  );
  const filteredLoanOpportunities = useMemo(
    () =>
      loanFilter === "All"
        ? loanOpportunities
        : loanOpportunities.filter((loan) => loan.state === loanFilter),
    [loanFilter, loanOpportunities]
  );

  useEffect(() => {
    if (filteredLoanOpportunities.length === 0) {
      if (loansStatus === "loaded") {
        setSelectedLoanId(null);
      }
      return;
    }

    const selectedLoanIsVisible = filteredLoanOpportunities.some(
      (loan) => loan.loanId === selectedLoanId
    );

    if (!selectedLoanIsVisible) {
      setSelectedLoanId(filteredLoanOpportunities[0].loanId);
    }
  }, [filteredLoanOpportunities, loansStatus, selectedLoanId]);

  const selectedLoanDetail = useMemo(
    () => {
      const selectedLoan = loanViews.find((loan) => loan.loanId === selectedLoanId);
      return selectedLoan === undefined ? null : toLoanDetail(selectedLoan);
    },
    [loanViews, selectedLoanId]
  );
  const selectedLoanMarketKey = useMemo(() => {
    if (selectedLoanDetail === null) {
      return null;
    }

    const linkedMarket = marketConfigs.find(
      (market) => market.marketId.toLowerCase() === selectedLoanDetail.marketId.toLowerCase()
    );

    return linkedMarket === undefined ? null : getMarketKey(linkedMarket.outcomeToken, linkedMarket.marketId);
  }, [marketConfigs, selectedLoanDetail]);

  useEffect(() => {
    if (!walletOnExpectedChain || walletAccount === null) {
      setWalletBalances(null);
      setWalletBalancesStatus("idle");
      setWalletBalancesError(null);
      return;
    }

    const provider = getInjectedWalletProvider();
    if (provider === null) {
      setWalletBalances(null);
      setWalletBalancesStatus("error");
      setWalletBalancesError("No injected wallet provider found.");
      return;
    }

    let cancelled = false;
    setWalletBalancesStatus("loading");
    setWalletBalancesError(null);

    readWalletBalances({
      provider,
      account: walletAccount.address,
      contracts: frontendContracts,
      selectedMarketId: selectedMarket?.marketId ?? null,
    })
      .then((balances) => {
        if (cancelled) {
          return;
        }

        setWalletBalances(balances);
        setWalletBalancesStatus("loaded");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setWalletBalances(null);
        setWalletBalancesError(error instanceof Error ? error.message : "Failed to read wallet balances");
        setWalletBalancesStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [accountRefreshNonce, selectedMarket?.marketId, walletAccount, walletOnExpectedChain]);

  const dashboardStats = useMemo(
    () => [
      {
        label: "Total funded",
        value: `${formatUsdc(
          loanViews.reduce((total, loan) => total + BigInt(loan.fundedAmount), 0n)
        )} USDC`,
        icon: CircleDollarSign,
      },
      { label: "CLOB markets", value: marketConfigs.length.toString(), icon: LineChart },
      {
        label: "Open loan requests",
        value: loanViews.filter((loan) => loan.state === "FUNDING" || loan.state === "FUNDED").length.toString(),
        icon: Clock3,
      },
      {
        label: "CLOB volume",
        value: `${formatUsdc(
          marketConfigs.reduce((total, market) => total + BigInt(market.confirmedUsdcVolume), 0n)
        )} USDC`,
        icon: Activity,
      },
    ],
    [loanViews, marketConfigs]
  );

  const connectWallet = () => {
    if (!hasInjectedWallet()) {
      setWalletAccount(null);
      setWalletStatus("unavailable");
      setWalletError("No injected EVM wallet detected. Open the app in a browser with MetaMask, Rabby, or another EVM wallet.");
      return;
    }

    setWalletStatus("connecting");
    setWalletError(null);

    requestWalletAccount()
      .then((account) => {
        setWalletAccount(account);
        setWalletStatus("connected");
      })
      .catch((error: unknown) => {
        setWalletAccount(null);
        setWalletStatus("error");
        setWalletError(error instanceof Error ? error.message : "Failed to connect wallet");
      });
  };

  const switchWalletToArc = () => {
    if (!hasInjectedWallet()) {
      setWalletAccount(null);
      setWalletStatus("unavailable");
      setWalletError("No injected EVM wallet detected. Open the app in a browser with MetaMask, Rabby, or another EVM wallet.");
      return;
    }

    setWalletStatus("connecting");
    setWalletError(null);

    switchWalletChain(expectedArcChainIdHex)
      .then(() => requestWalletAccount())
      .then((account) => {
        setWalletAccount(account);
        setWalletStatus("connected");
        setAccountRefreshNonce((value) => value + 1);
      })
      .catch((error: unknown) => {
        setWalletStatus("error");
        setWalletError(error instanceof Error ? error.message : "Failed to switch wallet to ARC");
      });
  };

  const handleWalletAction = () => {
    if (walletAccount !== null && !walletOnExpectedChain) {
      switchWalletToArc();
      return;
    }

    connectWallet();
  };

  const refreshAll = () => {
    setLastRefreshAt(new Date());
    setLoansRefreshNonce((value) => value + 1);
    setBookRefreshNonce((value) => value + 1);
    setAccountRefreshNonce((value) => value + 1);
  };

  const loadMoreLoans = () => {
    if (loanNextCursor === null || loanPageStatus === "loading") {
      return;
    }

    setLoanPageStatus("loading");
    setLoanPageError(null);

    fetchLoans({ cursor: loanNextCursor })
      .then((response) => {
        setLoanViews((current) => [...current, ...response.loans]);
        setLoanNextCursor(response.nextCursor);
        setLoanPageStatus("idle");
      })
      .catch((error: unknown) => {
        setLoanPageError(error instanceof Error ? error.message : "Failed to load more loans");
        setLoanPageStatus("error");
      });
  };

  const loadMoreMarkets = () => {
    if (marketNextCursor === null || marketPageStatus === "loading") {
      return;
    }

    setMarketPageStatus("loading");
    setMarketPageError(null);

    fetchMarkets({ cursor: marketNextCursor })
      .then((response) => {
        setMarketConfigs((current) => [...current, ...response.markets]);
        setMarketNextCursor(response.nextCursor);
        setMarketPageStatus("idle");
      })
      .catch((error: unknown) => {
        setMarketPageError(error instanceof Error ? error.message : "Failed to load more markets");
        setMarketPageStatus("error");
      });
  };

  const loadMoreOpenOrders = () => {
    if (walletAccount === null || openOrdersNextCursor === null || openOrdersPageStatus === "loading") {
      return;
    }

    setOpenOrdersPageStatus("loading");
    setOpenOrdersPageError(null);

    fetchOrders({
      maker: walletAccount.address,
      status: "LIVE",
      limit: 10,
      cursor: openOrdersNextCursor,
    })
      .then((response) => {
        setOpenOrders((current) => [...current, ...response.orders]);
        setOpenOrdersNextCursor(response.nextCursor);
        setOpenOrdersPageStatus("idle");
      })
      .catch((error: unknown) => {
        setOpenOrdersPageError(errorMessage(error, "Failed to load more open orders"));
        setOpenOrdersPageStatus("error");
      });
  };

  const loadMoreLoanPositions = () => {
    if (walletAccount === null || loanPositionsNextCursor === null || loanPositionsPageStatus === "loading") {
      return;
    }

    setLoanPositionsPageStatus("loading");
    setLoanPositionsPageError(null);

    fetchLoanPositions({
      account: walletAccount.address,
      limit: 10,
      cursor: loanPositionsNextCursor,
    })
      .then((response) => {
        setLoanPositions((current) => [...current, ...response.positions]);
        setLoanPositionsNextCursor(response.nextCursor);
        setLoanPositionsPageStatus("idle");
      })
      .catch((error: unknown) => {
        setLoanPositionsPageError(errorMessage(error, "Failed to load more lender positions"));
        setLoanPositionsPageStatus("error");
      });
  };

  const loadMoreTrades = () => {
    if (selectedMarket === null || tradesNextCursor === null || tradesPageStatus === "loading") {
      return;
    }

    setTradesPageStatus("loading");
    setTradesPageError(null);

    fetchTrades({
      outcomeToken: selectedMarket.outcomeToken,
      marketId: selectedMarket.marketId,
      outcome: selectedOutcome,
      limit: 8,
      cursor: tradesNextCursor,
    })
      .then((response) => {
        setRecentTrades((current) => [...current, ...response.trades]);
        setTradesNextCursor(response.nextCursor);
        setTradesPageStatus("idle");
      })
      .catch((error: unknown) => {
        setTradesPageError(errorMessage(error, "Failed to load more trades"));
        setTradesPageStatus("error");
      });
  };

  const openSelectedLoanMarket = () => {
    if (selectedLoanMarketKey === null) {
      return;
    }

    setMarketFilter("All");
    setSelectedMarketKey(selectedLoanMarketKey);
    navigateToMarket(selectedLoanMarketKey);
  };

  const openLoanDetail = (loanId: string) => {
    setLoanFilter("All");
    setSelectedLoanId(loanId);
    navigateToLoan(loanId);
  };

  const openMarketDetail = (marketKey: string) => {
    setMarketFilter("All");
    setSelectedMarketKey(marketKey);
    navigateToMarket(marketKey);
  };
  return {
    activeScreen,
    routeLoanId,
    routeMarketKey,
    screenCopy,
    lastRefreshAt,
    health,
    healthStatus,
    healthError,
    walletAccount,
    walletStatus,
    walletError,
    walletOnExpectedChain,
    connectWallet: handleWalletAction,
    refreshAll,
    dashboardStats,
    selectedLoanDetail,
    selectedMarket,
    loanOpportunities,
    filteredLoanOpportunities,
    loansStatus,
    loansError,
    loanFilter,
    setLoanFilter,
    selectedLoanId,
    setSelectedLoanId,
    openLoanDetail,
    loanNextCursor,
    loanPageStatus,
    loanPageError,
    loadMoreLoans,
    selectedLoanMarketKey,
    openSelectedLoanMarket,
    setLoansRefreshNonce,
    setAccountRefreshNonce,
    setBookRefreshNonce,
    walletBalances,
    walletBalancesStatus,
    walletBalancesError,
    marketFilter,
    setMarketFilter,
    predictionMarkets,
    filteredPredictionMarkets,
    marketsStatus,
    marketsError,
    marketNextCursor,
    marketPageStatus,
    marketPageError,
    selectedMarketKey,
    setSelectedMarketKey,
    openMarketDetail,
    bookSnapshot,
    bookStatus,
    bookError,
    selectedOutcome,
    setSelectedOutcome,
    recentTrades,
    tradesStatus,
    tradesError,
    tradesNextCursor,
    tradesPageStatus,
    tradesPageError,
    feedStatus,
    feedError,
    loadMoreMarkets,
    loadMoreTrades,
    openOrders,
    openOrdersStatus,
    openOrdersError,
    openOrdersNextCursor,
    openOrdersPageStatus,
    openOrdersPageError,
    loadMoreOpenOrders,
    loanPositions,
    loanPositionsStatus,
    loanPositionsError,
    loanPositionsNextCursor,
    loanPositionsPageStatus,
    loanPositionsPageError,
    loadMoreLoanPositions,
    reservations,
    reservationsStatus,
    reservationsError,
    navigateToScreen,
    expectedArcChainIdHex,
    expectedArcChainIdNumber,
    frontendContracts,
    formatTopbarTime,
    shortHex,
    walletButtonLabel,
    hasInjectedWallet,
  };
}
