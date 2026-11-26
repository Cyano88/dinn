BEGIN;
CREATE TABLE IF NOT EXISTS dinn_agent_ideas (
    id UUID PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE,
    name_key TEXT NOT NULL UNIQUE,
    activity_key TEXT NOT NULL UNIQUE,
    brief JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS dinn_idea_launches (
    token TEXT PRIMARY KEY,
    transaction_hash TEXT NOT NULL,
    reference TEXT NOT NULL REFERENCES dinn_agent_ideas(reference)
);
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'dinn_near_worker') THEN
        GRANT INSERT, SELECT ON dinn_agent_ideas TO dinn_near_worker;
        GRANT SELECT ON dinn_idea_launches TO dinn_near_worker;
    END IF;
END $$;
COMMIT;
