"""Админка BPM-платформы на /admin.

SQLAdmin работает поверх тех же SQLAlchemy-моделей и той же базы, что и API, —
в админке видны ровно те данные, которые обслуживает приложение, без второго
источника правды.
"""
import logging

from fastapi import FastAPI
from sqladmin import Admin

from ..config import settings
from ..database import engine
from .auth import AdminAuth, ensure_admin_user
from .views import ALL_VIEWS

logger = logging.getLogger(__name__)

__all__ = ["setup_admin", "ensure_admin_user"]


def setup_admin(app: FastAPI) -> Admin | None:
    if not settings.admin_enabled:
        logger.info("Админка отключена (ADMIN_ENABLED=false)")
        return None

    # session_kwargs уходят в starlette SessionMiddleware. Дефолты там мягкие
    # (cookie без Secure, same_site=lax, срок 14 суток) — для панели с полным
    # доступом к базе задаём строже:
    #   https_only — cookie не уйдёт по обычному http (на localhost выключается);
    #   same_site=strict — cookie не приложится к переходам со сторонних сайтов;
    #   max_age — сессия живёт рабочий день, а не две недели.
    admin = Admin(
        app,
        engine,
        title="BPM Platform — администрирование",
        base_url="/admin",
        authentication_backend=AdminAuth(
            secret_key=settings.admin_session_key,
            https_only=settings.admin_cookie_secure,
            same_site="strict",
            max_age=settings.admin_session_max_age,
        ),
    )
    for view in ALL_VIEWS:
        admin.add_view(view)
    return admin
