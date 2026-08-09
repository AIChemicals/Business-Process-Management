"""Одноразовые токены (подтверждение почты, сброс пароля)."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.token import AuthToken


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_token(db: Session, user_id: int, purpose: str, ttl_hours: int) -> str:
    """Создаёт токен, деактивировав прежние того же назначения. Возвращает сырой токен."""
    now = datetime.now(timezone.utc)
    for old in db.scalars(
        select(AuthToken).where(
            AuthToken.user_id == user_id, AuthToken.purpose == purpose, AuthToken.used_at.is_(None)
        )
    ):
        old.used_at = now  # прежние ссылки перестают действовать

    raw = secrets.token_urlsafe(32)
    db.add(
        AuthToken(
            user_id=user_id,
            purpose=purpose,
            token_hash=_hash(raw),
            expires_at=now + timedelta(hours=ttl_hours),
        )
    )
    db.commit()
    return raw


def consume_token(db: Session, raw: str, purpose: str) -> int | None:
    """Гасит токен и возвращает user_id, либо None (не найден/просрочен/использован)."""
    record = db.scalar(
        select(AuthToken).where(AuthToken.token_hash == _hash(raw), AuthToken.purpose == purpose)
    )
    if record is None or record.used_at is not None:
        return None
    expires = record.expires_at
    if expires.tzinfo is None:  # SQLite отдаёт naive datetime
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        return None
    record.used_at = datetime.now(timezone.utc)
    db.commit()
    return record.user_id
