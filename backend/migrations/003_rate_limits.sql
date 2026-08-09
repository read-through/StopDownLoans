CREATE TABLE rate_limit_windows (
    scope TEXT NOT NULL,
    subject_hash BYTEA NOT NULL,
    window_started_at TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (scope, subject_hash, window_started_at),
    CONSTRAINT rate_limit_windows_count_check CHECK (request_count > 0),
    CONSTRAINT rate_limit_windows_expiry_check CHECK (expires_at > window_started_at)
);

CREATE INDEX rate_limit_windows_expiry_idx
    ON rate_limit_windows (expires_at);
