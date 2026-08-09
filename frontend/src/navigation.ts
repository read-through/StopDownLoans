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
      title: "Credit lines",
      description: "Compare terms, funding progress, collateral, and repayment state.",
    };
  }

  if (screen === "create") {
    return {
      title: "Borrow",
      description: "Open a fixed-rate credit request with a linked repayment market.",
    };
  }

  if (screen === "exchange") {
    return {
      title: "Risk markets",
      description: "Trade YES or NO exposure for every active credit line.",
    };
  }

  if (screen === "portfolio") {
    return {
      title: "Portfolio",
      description: "Balances, lender positions, claims, reservations, and open orders.",
    };
  }

  return {
    title: "Overview",
    description: "Capital, credit lines, and repayment risk across the protocol.",
  };
}
