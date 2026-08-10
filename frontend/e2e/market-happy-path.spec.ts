import { expect, test } from "@playwright/test";

type Loan = {
  loanId: string;
  marketId: string;
};

type Market = {
  marketId: string;
  loan: null | {
    loanId: string;
  };
};

test("every indexed loan has a market that opens in the frontend", async ({ page, request }) => {
  const apiBaseUrl = process.env.E2E_API_URL ?? "";
  const healthResponse = await request.get(`${apiBaseUrl}/v1/health`);
  expect(healthResponse.ok()).toBeTruthy();

  const loansResponse = await request.get(`${apiBaseUrl}/v1/loans?limit=100`);
  expect(loansResponse.ok()).toBeTruthy();
  const { loans } = await loansResponse.json() as { loans: Loan[] };
  expect(loans.length).toBeGreaterThan(0);

  const marketsResponse = await request.get(`${apiBaseUrl}/v1/markets?limit=100`);
  expect(marketsResponse.ok()).toBeTruthy();
  const { markets } = await marketsResponse.json() as { markets: Market[] };
  expect(markets.length).toBeGreaterThan(0);

  const marketById = new Map(markets.map((market) => [market.marketId.toLowerCase(), market]));
  for (const loan of loans) {
    const market = marketById.get(loan.marketId.toLowerCase());
    expect(market, `Loan ${loan.loanId} is missing its CLOB market`).toBeDefined();
    expect(market?.loan?.loanId).toBe(loan.loanId);
  }

  await page.goto("/#exchange");
  await expect(page.getByRole("heading", { name: "Risk markets" })).toBeVisible();
  await expect(page.getByText("No CLOB markets configured yet.")).toHaveCount(0);

  const firstMarket = markets[0];
  const marketButton = page.getByRole("button", {
    name: new RegExp(`Loan #${firstMarket.loan?.loanId ?? ""} repayment`, "i"),
  }).first();
  await expect(marketButton).toBeVisible();
  await marketButton.click();

  await expect(page).toHaveURL(/#exchange\//);
  await expect(page.getByRole("region", { name: "Selected market", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Repayment market" })).toBeVisible();
  await expect(page.getByText("Selected market is loading or not indexed yet.")).toHaveCount(0);
});
