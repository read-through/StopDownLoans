CREATE TABLE orders (
    order_hash BYTEA PRIMARY KEY,
    maker BYTEA NOT NULL,
    outcome_token BYTEA NOT NULL,
    market_id BYTEA NOT NULL,
    outcome SMALLINT NOT NULL,
    side SMALLINT NOT NULL,
    outcome_amount NUMERIC(78, 0) NOT NULL,
    usdc_amount NUMERIC(78, 0) NOT NULL,
    expiration TIMESTAMPTZ NOT NULL,
    nonce NUMERIC(78, 0) NOT NULL,
    signature BYTEA NOT NULL,
    time_in_force TEXT NOT NULL,
    remaining_outcome_amount NUMERIC(78, 0) NOT NULL,
    pending_matched_outcome_amount NUMERIC(78, 0) NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    accepted_sequence BIGSERIAL NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT orders_outcome_check CHECK (outcome IN (0, 1)),
    CONSTRAINT orders_side_check CHECK (side IN (0, 1)),
    CONSTRAINT orders_outcome_amount_positive_check CHECK (outcome_amount > 0),
    CONSTRAINT orders_usdc_amount_positive_check CHECK (usdc_amount > 0),
    CONSTRAINT orders_remaining_bounds_check CHECK (
        remaining_outcome_amount >= 0
        AND remaining_outcome_amount <= outcome_amount
    ),
    CONSTRAINT orders_pending_bounds_check CHECK (
        pending_matched_outcome_amount >= 0
        AND pending_matched_outcome_amount <= remaining_outcome_amount
    ),
    CONSTRAINT orders_time_in_force_check CHECK (time_in_force IN ('GTC', 'FAK')),
    CONSTRAINT orders_status_check CHECK (status IN ('LIVE', 'FILLED', 'CANCELLED', 'EXPIRED', 'FAILED'))
);

CREATE INDEX orders_book_live_idx
    ON orders (outcome_token, market_id, outcome, side, status, accepted_sequence);

CREATE INDEX orders_maker_status_idx
    ON orders (maker, status);

CREATE INDEX orders_expiration_idx
    ON orders (expiration)
    WHERE status = 'LIVE';

CREATE TABLE processed_chain_events (
    tx_hash BYTEA NOT NULL,
    log_index INTEGER NOT NULL,
    block_number BIGINT NOT NULL,
    event_name TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tx_hash, log_index),

    CONSTRAINT processed_chain_events_log_index_check CHECK (log_index >= 0),
    CONSTRAINT processed_chain_events_block_number_check CHECK (block_number >= 0),
    CONSTRAINT processed_chain_events_event_name_check CHECK (event_name IN ('OrderFilled', 'OrdersMatched'))
);

CREATE INDEX processed_chain_events_block_idx
    ON processed_chain_events (block_number);

CREATE TABLE backend_cursors (
    cursor_name TEXT PRIMARY KEY,
    block_number BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT backend_cursors_block_number_check CHECK (block_number >= 0)
);

CREATE TABLE market_configs (
    outcome_token BYTEA NOT NULL,
    market_id BYTEA NOT NULL,
    clob_enabled BOOLEAN NOT NULL DEFAULT true,
    default_tick_units BIGINT NOT NULL,
    edge_tick_units BIGINT NOT NULL,
    lower_edge_price_units BIGINT NOT NULL,
    upper_edge_price_units BIGINT NOT NULL,
    min_order_outcome_amount NUMERIC(78, 0),
    max_order_outcome_amount NUMERIC(78, 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (outcome_token, market_id),

    CONSTRAINT market_configs_default_tick_positive_check CHECK (default_tick_units > 0),
    CONSTRAINT market_configs_edge_tick_positive_check CHECK (edge_tick_units > 0),
    CONSTRAINT market_configs_lower_edge_price_check CHECK (lower_edge_price_units >= 0),
    CONSTRAINT market_configs_upper_edge_price_check CHECK (upper_edge_price_units <= 1000000),
    CONSTRAINT market_configs_edge_order_check CHECK (lower_edge_price_units < upper_edge_price_units),
    CONSTRAINT market_configs_min_order_positive_check CHECK (
        min_order_outcome_amount IS NULL OR min_order_outcome_amount > 0
    ),
    CONSTRAINT market_configs_max_order_positive_check CHECK (
        max_order_outcome_amount IS NULL OR max_order_outcome_amount > 0
    ),
    CONSTRAINT market_configs_min_max_order_check CHECK (
        min_order_outcome_amount IS NULL
        OR max_order_outcome_amount IS NULL
        OR min_order_outcome_amount <= max_order_outcome_amount
    )
);

CREATE INDEX market_configs_pagination_idx
    ON market_configs (updated_at DESC, outcome_token ASC, market_id ASC);

CREATE TABLE reservations (
    maker BYTEA NOT NULL,
    asset_type TEXT NOT NULL,
    asset_address BYTEA NOT NULL,
    token_id NUMERIC(78, 0) NOT NULL,
    reserved_amount NUMERIC(78, 0) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (maker, asset_type, asset_address, token_id),

    CONSTRAINT reservations_asset_type_check CHECK (asset_type IN ('ERC20', 'ERC1155')),
    CONSTRAINT reservations_token_id_check CHECK (token_id >= 0),
    CONSTRAINT reservations_reserved_amount_check CHECK (reserved_amount >= 0)
);

CREATE TABLE trades (
    trade_id BIGSERIAL PRIMARY KEY,
    taker_order_hash BYTEA NOT NULL REFERENCES orders(order_hash),
    outcome_token BYTEA NOT NULL,
    market_id BYTEA NOT NULL,
    outcome SMALLINT NOT NULL,
    total_outcome_amount NUMERIC(78, 0) NOT NULL,
    total_usdc_amount NUMERIC(78, 0) NOT NULL,
    status TEXT NOT NULL,
    tx_hash BYTEA,
    submitted_at TIMESTAMPTZ,
    mined_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT trades_outcome_check CHECK (outcome IN (0, 1)),
    CONSTRAINT trades_total_outcome_amount_check CHECK (total_outcome_amount > 0),
    CONSTRAINT trades_total_usdc_amount_check CHECK (total_usdc_amount > 0),
    CONSTRAINT trades_status_check CHECK (status IN ('MATCHED', 'EXECUTING', 'SUBMITTED', 'MINED', 'CONFIRMED', 'RETRYING', 'FAILED'))
);

CREATE INDEX trades_status_idx
    ON trades (status, created_at);

CREATE INDEX trades_market_idx
    ON trades (outcome_token, market_id, outcome, created_at);

CREATE INDEX trades_tx_hash_idx
    ON trades (tx_hash)
    WHERE tx_hash IS NOT NULL;

CREATE TABLE trade_fills (
    trade_fill_id BIGSERIAL PRIMARY KEY,
    trade_id BIGINT NOT NULL REFERENCES trades(trade_id),
    taker_order_hash BYTEA NOT NULL REFERENCES orders(order_hash),
    maker_order_hash BYTEA NOT NULL REFERENCES orders(order_hash),
    maker_fill_amount NUMERIC(78, 0) NOT NULL,
    maker_usdc_amount NUMERIC(78, 0) NOT NULL,
    maker_price_numerator NUMERIC(78, 0) NOT NULL,
    maker_price_denominator NUMERIC(78, 0) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT trade_fills_maker_fill_amount_check CHECK (maker_fill_amount > 0),
    CONSTRAINT trade_fills_maker_usdc_amount_check CHECK (maker_usdc_amount > 0),
    CONSTRAINT trade_fills_maker_price_numerator_check CHECK (maker_price_numerator > 0),
    CONSTRAINT trade_fills_maker_price_denominator_check CHECK (maker_price_denominator > 0)
);

CREATE INDEX trade_fills_trade_idx
    ON trade_fills (trade_id);

CREATE INDEX trade_fills_taker_idx
    ON trade_fills (taker_order_hash);

CREATE INDEX trade_fills_maker_idx
    ON trade_fills (maker_order_hash);

CREATE TABLE settlement_attempts (
    settlement_attempt_id BIGSERIAL PRIMARY KEY,
    trade_id BIGINT NOT NULL REFERENCES trades(trade_id),
    operator BYTEA NOT NULL,
    tx_hash BYTEA,
    status TEXT NOT NULL,
    error_code TEXT,
    error_message TEXT,
    submitted_at TIMESTAMPTZ,
    mined_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT settlement_attempts_status_check CHECK (
        status IN ('CREATED', 'SUBMITTED', 'MINED', 'REVERTED', 'DROPPED', 'FAILED')
    )
);

CREATE INDEX settlement_attempts_trade_idx
    ON settlement_attempts (trade_id, created_at);

CREATE INDEX settlement_attempts_status_idx
    ON settlement_attempts (status, created_at);

CREATE INDEX settlement_attempts_tx_hash_idx
    ON settlement_attempts (tx_hash)
    WHERE tx_hash IS NOT NULL;

CREATE TABLE market_config_events (
    market_config_event_id BIGSERIAL PRIMARY KEY,
    outcome_token BYTEA NOT NULL,
    market_id BYTEA NOT NULL,
    event_type TEXT NOT NULL,
    default_tick_units BIGINT,
    edge_tick_units BIGINT,
    lower_edge_price_units BIGINT,
    upper_edge_price_units BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,

    CONSTRAINT market_config_events_type_check CHECK (
        event_type IN ('TICK_SIZE_CHANGE', 'MARKET_OPENED', 'MARKET_CLOSED')
    ),
    CONSTRAINT market_config_events_default_tick_positive_check CHECK (
        default_tick_units IS NULL OR default_tick_units > 0
    ),
    CONSTRAINT market_config_events_edge_tick_positive_check CHECK (
        edge_tick_units IS NULL OR edge_tick_units > 0
    ),
    CONSTRAINT market_config_events_lower_edge_price_check CHECK (
        lower_edge_price_units IS NULL OR lower_edge_price_units >= 0
    ),
    CONSTRAINT market_config_events_upper_edge_price_check CHECK (
        upper_edge_price_units IS NULL OR upper_edge_price_units <= 1000000
    ),
    CONSTRAINT market_config_events_edge_order_check CHECK (
        lower_edge_price_units IS NULL
        OR upper_edge_price_units IS NULL
        OR lower_edge_price_units < upper_edge_price_units
    )
);

CREATE INDEX market_config_events_unprocessed_idx
    ON market_config_events (created_at, market_config_event_id)
    WHERE processed_at IS NULL;
