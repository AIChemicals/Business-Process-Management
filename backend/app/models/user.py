from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Подтверждена ли почта. Вход возможен и без подтверждения, но интерфейс
    # напоминает о привязке, а восстановление пароля работает только по email.
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    # Доступ в админку на /admin. Через API не выдаётся — только вручную
    # в админке или через ADMIN_EMAIL при старте.
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def __str__(self) -> str:  # подпись записи в админке
        return self.email
