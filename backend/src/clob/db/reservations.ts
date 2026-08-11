import type { AssetType, Hex, Reservation } from "../types.js";
import type { DbClient } from "./client.js";
import { hexToBuffer } from "./hex.js";
import { mapReservationRow, type ReservationRow } from "./rows.js";

export type ReservationKey = {
  maker: Hex;
  assetType: AssetType;
  assetAddress: Hex;
  tokenId: bigint;
};

export async function getReservation(
  client: DbClient,
  key: ReservationKey
): Promise<Reservation | null> {
  const result = await client.query<ReservationRow>(
    `
      SELECT
        maker,
        asset_type,
        asset_address,
        token_id,
        reserved_amount,
        updated_at
      FROM reservations
      WHERE maker = $1
        AND asset_type = $2
        AND asset_address = $3
        AND token_id = $4
    `,
    [
      hexToBuffer(key.maker),
      key.assetType,
      hexToBuffer(key.assetAddress),
      key.tokenId.toString(),
    ]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapReservationRow(result.rows[0]);
}

export async function getReservationForUpdate(
  client: DbClient,
  key: ReservationKey
): Promise<Reservation | null> {
  const result = await client.query<ReservationRow>(
    `
      SELECT
        maker,
        asset_type,
        asset_address,
        token_id,
        reserved_amount,
        updated_at
      FROM reservations
      WHERE maker = $1
        AND asset_type = $2
        AND asset_address = $3
        AND token_id = $4
      FOR UPDATE
    `,
    [
      hexToBuffer(key.maker),
      key.assetType,
      hexToBuffer(key.assetAddress),
      key.tokenId.toString(),
    ]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapReservationRow(result.rows[0]);
}

export async function getReservationsByMaker(
  client: DbClient,
  maker: Hex
): Promise<Reservation[]> {
  const result = await client.query<ReservationRow>(
    `
      SELECT
        maker,
        asset_type,
        asset_address,
        token_id,
        reserved_amount,
        updated_at
      FROM reservations
      WHERE maker = $1
      ORDER BY asset_type ASC, asset_address ASC, token_id ASC
    `,
    [hexToBuffer(maker)]
  );

  return result.rows.map(mapReservationRow);
}

export async function increaseReservation(
  client: DbClient,
  key: ReservationKey,
  amount: bigint
): Promise<Reservation> {
  assertPositiveAmount(amount);

  const result = await client.query<ReservationRow>(
    `
      INSERT INTO reservations (
        maker,
        asset_type,
        asset_address,
        token_id,
        reserved_amount
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (maker, asset_type, asset_address, token_id)
      DO UPDATE SET
        reserved_amount = reservations.reserved_amount + EXCLUDED.reserved_amount,
        updated_at = now()
      RETURNING
        maker,
        asset_type,
        asset_address,
        token_id,
        reserved_amount,
        updated_at
    `,
    [
      hexToBuffer(key.maker),
      key.assetType,
      hexToBuffer(key.assetAddress),
      key.tokenId.toString(),
      amount.toString(),
    ]
  );

  return mapReservationRow(result.rows[0]);
}

export async function decreaseReservation(
  client: DbClient,
  key: ReservationKey,
  amount: bigint
): Promise<Reservation | null> {
  assertPositiveAmount(amount);

  const result = await client.query<ReservationRow>(
    `
      UPDATE reservations
      SET
        reserved_amount = reserved_amount - $5,
        updated_at = now()
      WHERE maker = $1
        AND asset_type = $2
        AND asset_address = $3
        AND token_id = $4
        AND reserved_amount >= $5
      RETURNING
        maker,
        asset_type,
        asset_address,
        token_id,
        reserved_amount,
        updated_at
    `,
    [
      hexToBuffer(key.maker),
      key.assetType,
      hexToBuffer(key.assetAddress),
      key.tokenId.toString(),
      amount.toString(),
    ]
  );

  if (result.rowCount === 1) {
    const reservation = mapReservationRow(result.rows[0]);
    return reservation.reservedAmount === 0n ? await deleteEmptyReservation(client, key) : reservation;
  }

  const current = await getReservation(client, key);
  const currentAmount = current?.reservedAmount ?? 0n;

  throw new Error(
    `Cannot decrease reservation below zero: requested ${amount.toString()}, current ${currentAmount.toString()}`
  );
}

function assertPositiveAmount(amount: bigint): void {
  if (amount <= 0n) {
    throw new Error(`Reservation amount must be positive: ${amount.toString()}`);
  }
}

async function deleteEmptyReservation(
  client: DbClient,
  key: ReservationKey
): Promise<null> {
  await client.query(
    `
      DELETE FROM reservations
      WHERE maker = $1
        AND asset_type = $2
        AND asset_address = $3
        AND token_id = $4
        AND reserved_amount = 0
    `,
    [
      hexToBuffer(key.maker),
      key.assetType,
      hexToBuffer(key.assetAddress),
      key.tokenId.toString(),
    ]
  );

  return null;
}
