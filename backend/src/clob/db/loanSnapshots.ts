import type { DbClient } from "./client.js";
import { hexToBuffer } from "./hex.js";
import { mapLoanSnapshotRow, type LoanSnapshotRow } from "./rows.js";
import type { Hex, LoanSnapshot } from "../types.js";

export type UpsertLoanSnapshotInput = Omit<LoanSnapshot, "syncedAt" | "updatedAt">;

export async function getLoanSnapshot(client: DbClient, loanId: bigint): Promise<LoanSnapshot | null> {
  const result = await client.query<LoanSnapshotRow>(
    `
      SELECT *
      FROM loan_snapshots
      WHERE loan_id = $1
    `,
    [loanId.toString()]
  );

  return result.rows[0] === undefined ? null : mapLoanSnapshotRow(result.rows[0]);
}

export async function getLoanSnapshotByMarketId(client: DbClient, marketId: Hex): Promise<LoanSnapshot | null> {
  const result = await client.query<LoanSnapshotRow>(
    `
      SELECT *
      FROM loan_snapshots
      WHERE market_id = $1
    `,
    [hexToBuffer(marketId)]
  );

  return result.rows[0] === undefined ? null : mapLoanSnapshotRow(result.rows[0]);
}

export async function listLoanSnapshots(client: DbClient, params: {
  limit: number;
  cursor?: bigint;
}): Promise<LoanSnapshot[]> {
  const result = await client.query<LoanSnapshotRow>(
    `
      SELECT *
      FROM loan_snapshots
      WHERE ($2::numeric IS NULL OR loan_id <= $2)
      ORDER BY loan_id DESC
      LIMIT $1
    `,
    [params.limit, params.cursor?.toString() ?? null]
  );

  return result.rows.map(mapLoanSnapshotRow);
}

export async function getLoanSnapshotsByMarketIds(
  client: DbClient,
  marketIds: readonly Hex[]
): Promise<Map<string, LoanSnapshot>> {
  if (marketIds.length === 0) {
    return new Map();
  }

  const result = await client.query<LoanSnapshotRow>(
    `
      SELECT *
      FROM loan_snapshots
      WHERE market_id = ANY($1::bytea[])
    `,
    [marketIds.map(hexToBuffer)]
  );

  return new Map(result.rows.map((row) => {
    const snapshot = mapLoanSnapshotRow(row);
    return [snapshot.marketId.toLowerCase(), snapshot];
  }));
}

export async function upsertLoanSnapshot(
  client: DbClient,
  input: UpsertLoanSnapshotInput
): Promise<LoanSnapshot> {
  const result = await client.query<LoanSnapshotRow>(
    `
      INSERT INTO loan_snapshots (
        loan_id,
        borrower,
        principal,
        repayment_amount,
        loan_withdraw_freeze_deadline,
        activation_deadline,
        repayment_deadline,
        funded_amount,
        credited_amount,
        repayment_satisfied_at,
        fee_claimed_amount,
        state,
        interest_bps,
        fee_bps,
        fee_recipient,
        collateral_bps,
        borrower_collateral_amount,
        borrower_collateral_deposited_amount,
        market_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19
      )
      ON CONFLICT (loan_id)
      DO UPDATE SET
        borrower = EXCLUDED.borrower,
        principal = EXCLUDED.principal,
        repayment_amount = EXCLUDED.repayment_amount,
        loan_withdraw_freeze_deadline = EXCLUDED.loan_withdraw_freeze_deadline,
        activation_deadline = EXCLUDED.activation_deadline,
        repayment_deadline = EXCLUDED.repayment_deadline,
        funded_amount = EXCLUDED.funded_amount,
        credited_amount = EXCLUDED.credited_amount,
        repayment_satisfied_at = EXCLUDED.repayment_satisfied_at,
        fee_claimed_amount = EXCLUDED.fee_claimed_amount,
        state = EXCLUDED.state,
        interest_bps = EXCLUDED.interest_bps,
        fee_bps = EXCLUDED.fee_bps,
        fee_recipient = EXCLUDED.fee_recipient,
        collateral_bps = EXCLUDED.collateral_bps,
        borrower_collateral_amount = EXCLUDED.borrower_collateral_amount,
        borrower_collateral_deposited_amount = EXCLUDED.borrower_collateral_deposited_amount,
        market_id = EXCLUDED.market_id,
        synced_at = now(),
        updated_at = now()
      RETURNING *
    `,
    [
      input.loanId.toString(),
      hexToBuffer(input.borrower),
      input.principal.toString(),
      input.repaymentAmount.toString(),
      input.loanWithdrawFreezeDeadline.toString(),
      input.activationDeadline.toString(),
      input.repaymentDeadline.toString(),
      input.fundedAmount.toString(),
      input.creditedAmount.toString(),
      input.repaymentSatisfiedAt.toString(),
      input.feeClaimedAmount.toString(),
      input.state,
      input.interestBps.toString(),
      input.feeBps.toString(),
      hexToBuffer(input.feeRecipient),
      input.collateralBps.toString(),
      input.borrowerCollateralAmount.toString(),
      input.borrowerCollateralDepositedAmount.toString(),
      hexToBuffer(input.marketId),
    ]
  );

  return mapLoanSnapshotRow(result.rows[0]);
}
