from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .user import User


class Workspace(Base):
    """Серверная копия рабочего пространства пользователя.

    Снимок целиком (отделы, роли, шаблоны, матрица, инстансы, задачи) в одном
    JSON-поле: структура данных фронтенда сохраняется как есть, синхронизация —
    один PUT вместо десятка CRUD-эндпоинтов. Локальная копия в браузере остаётся
    кэшем для офлайн-работы.
    """

    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    data: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(viewonly=True)

    def __str__(self) -> str:
        return f"workspace user {self.user_id}"
