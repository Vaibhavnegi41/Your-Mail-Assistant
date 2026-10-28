import os
import socket
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

raw_db_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/ai_email_assistant")


def is_postgres_available(host: str = "localhost", port: int = 5432, timeout: float = 0.5) -> bool:
    """Quick socket check to verify whether Postgres is reachable without blocking startup."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def get_engine():
    """Attempt to create engine with postgres driver, falling back gracefully to SQLite for local development."""
    if is_postgres_available():
        for url in [
            raw_db_url.replace("postgresql://", "postgresql+psycopg://", 1),
            raw_db_url
        ]:
            try:
                return create_engine(url, pool_pre_ping=True)
            except Exception:
                continue

    # SQLite fallback when PostgreSQL is not running
    print("[Database] PostgreSQL is not running locally. Using SQLite fallback (./email_assistant.db).")
    return create_engine("sqlite:///./email_assistant.db", connect_args={"check_same_thread": False})


engine = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Checkpointer lifecycle for LangGraph
_checkpointer_cm = None
checkpointer = None


def init_checkpointer():
    global _checkpointer_cm, checkpointer
    if checkpointer is None:
        if is_postgres_available():
            try:
                from langgraph.checkpoint.postgres import PostgresSaver
                db_url = raw_db_url.replace("postgresql+psycopg://", "postgresql://")
                _checkpointer_cm = PostgresSaver.from_conn_string(db_url)
                checkpointer = _checkpointer_cm.__enter__()
                checkpointer.setup()
                print("[LangGraph] Connected to PostgreSQL PostgresSaver checkpointer.")
                return checkpointer
            except Exception as e:
                print(f"[LangGraph] PostgresSaver connection failed ({e}). Falling back to MemorySaver.")

        # Fallback to MemorySaver so HITL interrupt() always works even without PostgreSQL
        from langgraph.checkpoint.memory import MemorySaver
        print("[LangGraph] Using in-memory checkpointer (MemorySaver).")
        checkpointer = MemorySaver()

    return checkpointer


def close_checkpointer():
    global _checkpointer_cm, checkpointer
    if _checkpointer_cm is not None:
        try:
            _checkpointer_cm.__exit__(None, None, None)
        except Exception:
            pass
        _checkpointer_cm = None
        checkpointer = None
