from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .user import User


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    plan: Mapped[str] = mapped_column(String(32), default="free")
    status: Mapped[str] = mapped_column(String(32), default="active")  # active | cancelled
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Только для админки: показывать email вместо user_id. На схему не влияет.
    user: Mapped["User"] = relationship(viewonly=True)

    def __str__(self) -> str:
        return f"{self.plan} · {self.status}"


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    subscription_id: Mapped[int | None] = mapped_column(ForeignKey("subscriptions.id"), nullable=True)
    provider: Mapped[str] = mapped_column(String(32), default="mock")
    provider_payment_id: Mapped[str] = mapped_column(String(255), default="", index=True)
    amount_kzt: Mapped[int] = mapped_column(Integer)
    plan: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending | success | failed | expired
    method: Mapped[str] = mapped_column(String(16), default="qr")  # qr | card
    card_brand: Mapped[str] = mapped_column(String(32), default="")  # PAN/CVV не храним: только бренд
    card_last4: Mapped[str] = mapped_column(String(4), default="")  # и последние 4 цифры
    qr_token: Mapped[str] = mapped_column(Text, default="")
    payment_link: Mapped[str] = mapped_column(String(1024), default="")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(viewonly=True)

    def __str__(self) -> str:
        return f"#{self.id} · {self.amount_kzt} ₸ · {self.status}"
