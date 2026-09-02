/**
 * Component 38 — Audit. Database schema.
 *
 * The hash chain the previous build got right, carried forward:
 *   - `prev_hash` and `entry_hash` each exactly 32 bytes (CHECK constraints).
 *   - Both uniquely indexed. Uniqueness on `prev_hash` makes a forked chain
 *     impossible at the database — two entries cannot claim the same
 *     predecessor. Uniqueness on `entry_hash` makes a duplicate entry
 *     impossible.
 *   - Immutability enforced by a database trigger, not by application
 *     discipline.
 *
 * The trigger is the append-only enforcement. It blocks every UPDATE and
 * DELETE unless the caller has opened the minimization path by setting the
 * session variable `alter.allow_audit_minimization` to `on` (done inside a
 * transaction by the store's minimize/destroy methods). Even then it only
 * permits the two legal mutations:
 *   - UPDATE: null the `payload` and set `retention_until` — the Section 18
 *     minimization. History columns (seq, tenant, actor, type, time, hashes)
 *     are immutable even with the flag set.
 *   - DELETE: remove only a minimized skeleton whose retention window has
 *     expired. A live or unexpired row cannot be deleted even with the flag.
 *
 * This is the "must not be deletable by the subject it audits, except through
 * the minimization path in Section 18" requirement, made structural.
 */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS audit_events (
  seq            BIGSERIAL PRIMARY KEY,
  tenant_id      TEXT        NOT NULL,
  actor_id       TEXT        NOT NULL,
  event_type     TEXT        NOT NULL,
  occurred_at    TIMESTAMPTZ NOT NULL,
  prev_hash      BYTEA       NOT NULL,
  entry_hash     BYTEA       NOT NULL,
  payload        JSONB,
  retention_until TIMESTAMPTZ,
  CONSTRAINT audit_events_prev_hash_len  CHECK (octet_length(prev_hash) = 32),
  CONSTRAINT audit_events_entry_hash_len CHECK (octet_length(entry_hash) = 32),
  CONSTRAINT audit_events_prev_hash_unique  UNIQUE (prev_hash),
  CONSTRAINT audit_events_entry_hash_unique UNIQUE (entry_hash)
);

CREATE TABLE IF NOT EXISTS audit_alerts (
  id        BIGSERIAL PRIMARY KEY,
  raised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind      TEXT        NOT NULL,
  detail    JSONB       NOT NULL
);

CREATE OR REPLACE FUNCTION audit_events_immutable() RETURNS trigger AS $$
DECLARE
  allow_min BOOLEAN;
BEGIN
  allow_min := current_setting('alter.allow_audit_minimization', true) = 'on';

  IF TG_OP = 'UPDATE' THEN
    IF NOT (allow_min IS TRUE) THEN
      RAISE EXCEPTION 'audit_events is append-only: UPDATE blocked';
    END IF;
    IF NEW.seq IS DISTINCT FROM OLD.seq
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
       OR NEW.event_type IS DISTINCT FROM OLD.event_type
       OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
       OR NEW.prev_hash IS DISTINCT FROM OLD.prev_hash
       OR NEW.entry_hash IS DISTINCT FROM OLD.entry_hash THEN
      RAISE EXCEPTION 'audit_events is append-only: history columns are immutable';
    END IF;
    IF NEW.payload IS NOT NULL THEN
      RAISE EXCEPTION 'audit_events minimization: payload must be nulled, not replaced';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT (allow_min IS TRUE) THEN
      RAISE EXCEPTION 'audit_events is append-only: DELETE blocked';
    END IF;
    IF OLD.retention_until IS NULL OR OLD.retention_until > now() THEN
      RAISE EXCEPTION 'audit_events destruction: only expired minimized skeletons may be deleted';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();

DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events;
CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();
`;
