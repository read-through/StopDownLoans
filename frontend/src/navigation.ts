import type { AppScreen } from "./types";

export type AppRoute = {
  screen: AppScreen;
  loanId: string | null;
  marketKey: string | null;
};

export function getRouteFromHash(): AppRoute {
  const [screenPart, detailPart] = window.location.hash.replace("#", "").split("/");
  const screen = getScreen(screenPart);

  return {
    screen,
    loanId: screen === "loans" && detailPart !== undefined ? decodeURIComponent(detailPart) : null,
    marketKey: screen === "exchange" && detailPart !== undefined ? decodeURIComponent(detailPart) : null,
  };
}

export function getScreenFromHash(): AppScreen {
  return getRouteFromHash().screen;
}

function getScreen(hash: string): AppScreen {
  if (
    hash === "overview" ||
    hash === "create" ||
    hash === "loans" ||
    hash === "exchange" ||
    hash === "portfolio"
  ) {
    return hash;
  }

  return "overview";
}

export function navigateToScreen(screen: AppScreen): void {
  if (window.location.hash === `#${screen}`) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }

  window.location.hash = screen;
}

export function navigateToLoan(loanId: string): void {
  const nextHash = `#loans/${encodeURIComponent(loanId)}`;
  if (window.location.hash === nextHash) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }

  window.location.hash = nextHash;
}

export function navigateToMarket(marketKey: string): void {
  const nextHash = `#exchange/${encodeURIComponent(marketKey)}`;
  if (window.location.hash === nextHash) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }

  window.location.hash = nextHash;
}

export function getScreenCopy(screen: AppScreen): { title: string; description: string } {
  if (screen === "loans") {
    return {
      title: "Loan Marketplace",
      description: "All credit lines, funding progress, collateral state, and loan-level settlement controls.",
    };
  }

  if (screen === "create") {
    return {
      title: "Create Loan",
      description: "Borrower creates a loan request and its linked proto-market.",
    };
  }

  if (screen === "exchange") {
    return {
      title: "Exchange",
      description: "YES/NO markets for every loan, order books, trades, and limit order entry.",
    };
  }

  if (screen === "portfolio") {
    return {
      title: "Portfolio",
      description: "Wallet-specific positions, reservations, balances, claims, and open orders.",
    };
  }

  return {
    title: "Protocol Overview",
    description: "One operating surface for borrowers, lenders, and YES/NO traders.",
  };
}
