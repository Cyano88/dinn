CREATE TABLE IF NOT EXISTS dinn_logos (
 id UUID PRIMARY KEY,
 owner TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 model TEXT NOT NULL,
 prompt TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('generating','ready','uncertain')),
 image BYTEA,
 error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 accepted_at TIMESTAMPTZ,
 CHECK(image IS NULL OR octet_length(image)<=2000000)
);
CREATE INDEX IF NOT EXISTS dinn_logo_owner_created ON dinn_logos(owner,created_at DESC);
CREATE TABLE IF NOT EXISTS dinn_logo_usage (
 owner TEXT NOT NULL,
 day DATE NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(owner,day)
);

ALTER TABLE dinn_logos ADD COLUMN IF NOT EXISTS provider_job JSONB;
