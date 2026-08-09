"""Подписка пользователя, месячное потребление и проверка лимитов тарифа."""
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.ai import AiMessage
from ..models.billing import Subscription
from ..models.user import User
from ..plans import PLANS

_QUOTA_KEYS = {
    "ai_requests": ("ai_requests_per_month", "Лимит запросов к ИИ на вашем тарифе исчерпан"),
    "docs": ("docs_per_month", "Лимит генерации документов на вашем тарифе исчерпан"),
}


def get_or_create_subscription(db: Session, user: User) -> Subscription:
    subscription = db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if subscription is None:
        subscription = Subscription(user_id=user.id, plan="free", status="active")
        db.add(subscription)
        db.commit()
        db.refresh(subscription)
    return subscription


def effective_plan(db: Session, subscription: Subscription) -> str:
    """Тариф с учётом статуса и срока: истёкший оплаченный период = free.

    Продление здесь же, при чтении: фоновых задач нет, а Kaspi не поддерживает
    автосписание — по истечении периода пользователь возвращается на free
    и оплачивает новый период вручную.
    """
    if subscription.plan == "free":
        return "free"
    if subscription.status != "active":
        return "free"
    end = subscription.current_period_end
    if end is not None:
        if end.tzinfo is None:  # SQLite отдаёт naive datetime
            end = end.replace(tzinfo=timezone.utc)
        if end < datetime.now(timezone.utc):
            subscription.plan = "free"
            subscription.status = "active"
            subscription.current_period_start = None
            subscription.current_period_end = None
            db.commit()
            return "free"
    return subscription.plan


def _month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def month_usage(db: Session, user_id: int) -> dict:
    since = _month_start()
    ai_requests = db.scalar(
        select(func.count())
        .select_from(AiMessage)
        .where(
            AiMessage.user_id == user_id,
            AiMessage.role == "user",
            AiMessage.kind.in_(("chat", "generate")),
            AiMessage.created_at >= since,
        )
    )
    docs = db.scalar(
        select(func.count())
        .select_from(AiMessage)
        .where(AiMessage.user_id == user_id, AiMessage.kind == "doc", AiMessage.created_at >= since)
    )
    return {"ai_requests": ai_requests or 0, "docs": docs or 0}


def check_quota(db: Session, user: User, kind: str) -> None:
    """Бросает 402, если месячный лимит тарифа исчерпан. None в тарифе = безлимит."""
    limit_key, message = _QUOTA_KEYS[kind]
    subscription = get_or_create_subscription(db, user)
    limit = PLANS[effective_plan(db, subscription)][limit_key]
    if limit is None:
        return
    if month_usage(db, user.id)[kind] >= limit:
        raise HTTPException(status_code=402, detail=f"{message}. Перейдите на тариф выше в разделе «Тарифы».")
