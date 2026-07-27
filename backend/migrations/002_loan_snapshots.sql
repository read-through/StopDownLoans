CREATE TABLE loan_snapshots (
    loan_id NUMERIC(78, 0) PRIMARY KEY,
    borrower BYTEA NOT NULL,
    principal NUMERIC(78, 0) NOT NULL,
    repayment_amount NUMERIC(78, 0) NOT NULL,
    loan_withdraw_freeze_deadline NUMERIC(78, 0) NOT NULL,
    activation_deadline NUMERIC(78, 0) NOT NULL,
    repayment_deadline NUMERIC(78, 0) NOT NULL,
    funded_amount NUMERIC(78, 0) NOT NULL,
    credited_amount NUMERIC(78, 0) NOT NULL,
    repayment_satisfied_at NUMERIC(78, 0) NOT NULL,
    fee_claimed_amount NUMERIC(78, 0) NOT NULL,
    state TEXT NOT NULL,
    interest_bps NUMERIC(78, 0) NOT NULL,
    fee_bps NUMERIC(78, 0) NOT NULL,
    fee_recipient BYTEA NOT NULL,
    collateral_bps NUMERIC(78, 0) NOT NULL,
    borrower_collateral_amount NUMERIC(78, 0) NOT NULL,
    borrower_collateral_deposited_amount NUMERIC(78, 0) NOT NULL,
    market_id BYTEA NOT NULL UNIQUE,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT loan_snapshots_state_check CHECK (
        state IN ('FUNDING', 'FUNDED', 'ACTIVE', 'CANCELLED', 'REPAID', 'DEFAULTED')
    ),
    CONSTRAINT loan_snapshots_principal_check CHECK (principal > 0),
    CONSTRAINT loan_snapshots_amounts_check CHECK (
        repayment_amount >= 0
        AND funded_amount >= 0
        AND credited_amount >= 0
        AND fee_claimed_amount >= 0
        AND borrower_collateral_amount >= 0
        AND borrower_collateral_deposited_amount >= 0
    )
);

CREATE INDEX loan_snapshots_market_idx
    ON loan_snapshots (market_id);

CREATE INDEX loan_snapshots_state_idx
    ON loan_snapshots (state, loan_id DESC);
