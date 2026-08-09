from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


def _normalize_url(url: str) -> str:
    # Render выдаёт DATABASE_URL со схемой postgres://, которую SQLAlchemy 2.x
    # не принимает — приводим к postgresql+psycopg2://.
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg2://", 1)
    return url


DATABASE_URL = _normalize_url(settings.database_url)

# SQLite: check_same_thread=False, потому что FastAPI обслуживает синхронные
# эндпоинты из пула потоков; сессия при этом живёт в рамках одного запроса.
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Создаёт недостающие таблицы при старте.

    Проект новый и схема создаётся с нуля, поэтому create_all достаточно;
    при первом же изменении существующих таблиц нужно переходить на Alembic
    (см. опыт Dalel AI — миграции применяются на старте, т.к. на free-тарифе
    Render нет shell).
    """
    from . import models  # noqa: F401 — регистрирует модели в Base.metadata

    Base.metadata.create_all(bind=engine)
