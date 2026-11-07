import hashlib
import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4


class ControlledError(Exception):
    def __init__(self, code: str, message: str, status: int = 503):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def fingerprint(value) -> str:
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, separators=(",", ":"), ensure_ascii=True
        ).encode()
    ).hexdigest()


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self.connect() as connection:
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY, key TEXT UNIQUE NOT NULL, digest TEXT NOT NULL,
                    kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL,
                    phase TEXT NOT NULL, created REAL NOT NULL, updated REAL NOT NULL,
                    report TEXT, error TEXT, requests INTEGER NOT NULL DEFAULT 0,
                    reserved_tokens INTEGER NOT NULL DEFAULT 0, actual_tokens INTEGER NOT NULL DEFAULT 0,
                    cancel INTEGER NOT NULL DEFAULT 0, lease_until REAL,
                    model TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS cache (
                    key TEXT PRIMARY KEY, payload TEXT NOT NULL, expires REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS calls (
                    job_id TEXT NOT NULL, provider TEXT NOT NULL, created REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS artifacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL,
                    provider TEXT NOT NULL, payload TEXT NOT NULL, created REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS job_status ON jobs(status, created);
            """)

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path, timeout=15)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def create(
        self, key: str, kind: str, payload: dict, model: str
    ) -> tuple[dict, bool]:
        digest = fingerprint({"kind": kind, "payload": payload})
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                "SELECT * FROM jobs WHERE key=?", (key,)
            ).fetchone()
            if existing:
                if existing["digest"] != digest:
                    raise ControlledError(
                        "IDEMPOTENCY_CONFLICT",
                        "Key already used for different input",
                        409,
                    )
                return dict(existing), False
            active = connection.execute(
                "SELECT COUNT(*) FROM jobs WHERE status IN ('queued','running')"
            ).fetchone()[0]
            if active:
                raise ControlledError(
                    "CONCURRENCY_LIMIT", "One local analysis may run at a time", 429
                )
            identity, now = str(uuid4()), time.time()
            connection.execute(
                "INSERT INTO jobs(id,key,digest,kind,payload,status,phase,created,updated,model) "
                "VALUES(?,?,?,?,?,'queued','awaiting_worker',?,?,?)",
                (identity, key, digest, kind, json.dumps(payload), now, now, model),
            )
        return self.get(identity), True

    def get(self, identity: str) -> dict:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM jobs WHERE id=?", (identity,)
            ).fetchone()
        if row is None:
            raise ControlledError("NOT_FOUND", "Analysis not found", 404)
        return dict(row)

    def claim(self) -> dict | None:
        now = time.time()
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "UPDATE jobs SET status='failed',phase='finished',updated=?,error=? "
                "WHERE status='running' AND lease_until < ?",
                (
                    now,
                    json.dumps(
                        {
                            "code": "WORKER_INTERRUPTED",
                            "message": "Worker lease expired; create a new analysis to authorize more spending",
                        }
                    ),
                    now,
                ),
            )
            if connection.execute(
                "SELECT 1 FROM jobs WHERE status='running'"
            ).fetchone():
                return None
            row = connection.execute(
                "SELECT * FROM jobs WHERE status='queued' ORDER BY created LIMIT 1"
            ).fetchone()
            if row is None:
                return None
            connection.execute(
                "UPDATE jobs SET status='running',phase='collecting',updated=?,lease_until=? WHERE id=?",
                (now, now + 600, row["id"]),
            )
        return self.get(row["id"])

    def phase(self, identity: str, phase: str) -> None:
        self.check_cancel(identity)
        with self.connect() as connection:
            connection.execute(
                "UPDATE jobs SET phase=?,updated=?,lease_until=? WHERE id=? AND status='running'",
                (phase, time.time(), time.time() + 600, identity),
            )

    def check_cancel(self, identity: str) -> None:
        row = self.get(identity)
        if row["cancel"] or row["status"] == "cancelled":
            raise ControlledError("CANCELLED", "Analysis cancelled", 409)
        if row["status"] not in {"queued", "running"}:
            raise ControlledError(
                "ANALYSIS_TERMINAL", "Analysis is no longer active", 409
            )

    def cancel(self, identity: str) -> None:
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT status FROM jobs WHERE id=?", (identity,)
            ).fetchone()
            if row is None:
                raise ControlledError("NOT_FOUND", "Analysis not found", 404)
            if row["status"] not in {"queued", "running", "cancelled"}:
                raise ControlledError(
                    "ANALYSIS_TERMINAL", "Analysis already finished", 409
                )
            connection.execute(
                "UPDATE jobs SET cancel=1,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END, "
                "updated=? WHERE id=?",
                (time.time(), identity),
            )

    def reserve(self, identity: str, provider: str, amount: int, limit: int) -> None:
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT * FROM jobs WHERE id=?", (identity,)
            ).fetchone()
            if not row or row["cancel"] or row["status"] not in {"queued", "running"}:
                raise ControlledError("CANCELLED", "Analysis is no longer active", 409)
            column = "requests" if provider == "oriane" else "reserved_tokens"
            if row[column] + amount > limit:
                raise ControlledError(
                    "BUDGET_EXCEEDED", f"{provider} analysis budget exhausted", 429
                )
            if provider == "oriane":
                daily = connection.execute(
                    "SELECT COUNT(*) FROM calls WHERE provider='oriane' AND created>?",
                    (time.time() - 86400,),
                ).fetchone()[0]
                if daily >= 40:
                    raise ControlledError(
                        "DAILY_BUDGET_EXCEEDED",
                        "Local daily limit of 40 Oriane calls reached",
                        429,
                    )
            connection.execute(
                f"UPDATE jobs SET {column}={column}+?,updated=?,lease_until=? WHERE id=?",
                (amount, time.time(), time.time() + 600, identity),
            )
            connection.execute(
                "INSERT INTO calls VALUES(?,?,?)", (identity, provider, time.time())
            )

    def record_tokens(self, identity: str, amount: int) -> None:
        with self.connect() as connection:
            connection.execute(
                "UPDATE jobs SET actual_tokens=actual_tokens+? WHERE id=?",
                (amount, identity),
            )

    def finish(
        self, identity: str, report: dict | None, error: dict | None = None
    ) -> None:
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT cancel,status FROM jobs WHERE id=?", (identity,)
            ).fetchone()
            if row["status"] != "running":
                return
            status = (
                "cancelled"
                if row["cancel"]
                else "failed"
                if report is None
                else ("partial" if error or report.get("warnings") else "succeeded")
            )
            connection.execute(
                "UPDATE jobs SET status=?,phase='finished',updated=?,report=?,error=?,lease_until=NULL WHERE id=?",
                (
                    status,
                    time.time(),
                    json.dumps(report) if report is not None else None,
                    json.dumps(error) if error else None,
                    identity,
                ),
            )

    def cached(self, key: str) -> dict | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT payload FROM cache WHERE key=? AND expires>?",
                (key, time.time()),
            ).fetchone()
        return json.loads(row["payload"]) if row else None

    def cache(self, key: str, payload: dict, ttl: int) -> None:
        with self.connect() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO cache VALUES(?,?,?)",
                (key, json.dumps(payload), time.time() + ttl),
            )

    def artifact(self, identity: str, provider: str, payload: dict) -> None:
        if provider not in {"oriane", "openai"}:
            raise ValueError("Unsupported artifact provider")
        with self.connect() as connection:
            connection.execute(
                "INSERT INTO artifacts(job_id,provider,payload,created) VALUES(?,?,?,?)",
                (identity, provider, json.dumps(payload), time.time()),
            )

    def artifacts(self, identity: str, provider: str) -> list[dict]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT payload FROM artifacts WHERE job_id=? AND provider=? ORDER BY id",
                (identity, provider),
            ).fetchall()
        return [json.loads(row["payload"]) for row in rows]

    def prune(self, days: int) -> None:
        with self.connect() as connection:
            connection.execute("DELETE FROM cache WHERE expires < ?", (time.time(),))
            connection.execute(
                "DELETE FROM artifacts WHERE job_id IN (SELECT id FROM jobs WHERE updated<? "
                "AND status NOT IN ('running','queued'))",
                (time.time() - days * 86400,),
            )
            connection.execute(
                "DELETE FROM jobs WHERE updated<? AND status NOT IN ('running','queued')",
                (time.time() - days * 86400,),
            )
            connection.execute(
                "DELETE FROM calls WHERE created<?", (time.time() - days * 86400,)
            )
