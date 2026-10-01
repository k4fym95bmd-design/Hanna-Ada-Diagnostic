PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS telemetry_signal (
  signal_id INTEGER PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  unit TEXT,
  data_type TEXT NOT NULL CHECK(data_type IN ('number','integer','boolean','string','bytes')),
  bank INTEGER CHECK(bank IS NULL OR bank IN (1,2)),
  cylinder INTEGER CHECK(cylinder IS NULL OR cylinder BETWEEN 1 AND 8),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ecu_signal_binding (
  binding_id INTEGER PRIMARY KEY,
  ecu_family TEXT NOT NULL,
  sgbd TEXT NOT NULL,
  software_variant TEXT,
  job_name TEXT,
  result_name TEXT,
  signal_id INTEGER NOT NULL REFERENCES telemetry_signal(signal_id) ON DELETE RESTRICT,
  verification_state TEXT NOT NULL CHECK(
    verification_state IN ('DISCOVERED_RAW','PARSED_STRUCTURAL','RUNTIME_OBSERVED','TRACE_VERIFIED')
  ),
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256) = 64),
  trace_timestamp_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(verification_state != 'TRACE_VERIFIED' OR (job_name IS NOT NULL AND result_name IS NOT NULL AND trace_timestamp_ms IS NOT NULL)),
  UNIQUE(sgbd, job_name, result_name, signal_id)
);

CREATE INDEX IF NOT EXISTS idx_binding_trace_verified
ON ecu_signal_binding(sgbd, signal_id)
WHERE verification_state = 'TRACE_VERIFIED';
