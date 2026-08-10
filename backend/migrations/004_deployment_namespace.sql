ALTER TABLE loan_snapshots
    ADD COLUMN loan_position_token BYTEA;

UPDATE loan_snapshots
SET loan_position_token = decode(repeat('00', 20), 'hex')
WHERE loan_position_token IS NULL;

ALTER TABLE loan_snapshots
    ALTER COLUMN loan_position_token SET NOT NULL;

ALTER TABLE loan_snapshots
    DROP CONSTRAINT loan_snapshots_pkey,
    DROP CONSTRAINT loan_snapshots_market_id_key,
    ADD PRIMARY KEY (loan_position_token, loan_id),
    ADD CONSTRAINT loan_snapshots_deployment_market_key
        UNIQUE (loan_position_token, market_id);

DROP INDEX loan_snapshots_market_idx;
DROP INDEX loan_snapshots_state_idx;

CREATE INDEX loan_snapshots_market_idx
    ON loan_snapshots (loan_position_token, market_id);

CREATE INDEX loan_snapshots_state_idx
    ON loan_snapshots (loan_position_token, state, loan_id DESC);
