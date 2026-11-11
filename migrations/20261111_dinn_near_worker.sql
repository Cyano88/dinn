CREATE TABLE IF NOT EXISTS dinn_near_work (
    worker_id TEXT NOT NULL,
    assignment_id TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    lease_token TEXT,
    lease_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (worker_id, assignment_id)
);

CREATE TABLE IF NOT EXISTS dinn_near_work_events (
    id BIGSERIAL PRIMARY KEY,
    worker_id TEXT NOT NULL,
    assignment_id TEXT NOT NULL,
    event TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
