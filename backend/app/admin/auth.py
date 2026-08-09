"""Вход в админку.

Отдельных «админских аккаунтов» нет: используются те же пользователи из таблицы
users и тот же bcrypt-хеш, что и в основном API. В админку пускаются только
записи с is_admin = true.
"""
import logging

from sqladmin.authentication import AuthenticationBackend
from sqlalchemy import select
from starlette.requests import Request

from ..config import settings
from ..database import SessionLocal
from ..models.user import User
from ..security import hash_password, verify_password
from ..services.rate_limit import enforce, login_limiter

logger = logging.getLogger(__name__)

SESSION_KEY = "admin_user_id"


def _load_admin(user_id: int) -> User | None:
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is not None and user.is_active and user.is_admin:
            return user
    return None


class AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        # Лимит попыток — до обращения к базе: перебор пароля не должен
        # упираться только в скорость bcrypt.
        key = enforce(request, "admin")
        form = await request.form()
        email = str(form.get("username") or "").strip().lower()
        password = str(form.get("password") or "")

        with SessionLocal() as db:
            user = db.scalar(select(User).where(User.email == email))
            # Проверяем пароль даже для несуществующего пользователя: иначе по
            # времени ответа можно перебирать, какие email зарегистрированы.
            valid = verify_password(password, user.password_hash) if user else False
            if not valid or not user.is_active or not user.is_admin:
                login_limiter.register_failure(key)
                logger.warning("Неудачный вход в админку: %s", email or "<без email>")
                return False
            request.session[SESSION_KEY] = user.id
        login_limiter.reset(key)
        return True

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        user_id = request.session.get(SESSION_KEY)
        if not user_id:
            return False
        # Права проверяются на каждый запрос: снятый is_admin или блокировка
        # пользователя должны отключать доступ немедленно, не дожидаясь logout.
        if _load_admin(int(user_id)) is None:
            request.session.clear()
            return False
        return True


def ensure_admin_user() -> None:
    """Создаёт или повышает администратора из ADMIN_EMAIL / ADMIN_PASSWORD.

    Нужно потому, что на бесплатном тарифе Render нет shell, где можно было бы
    создать первого админа вручную. Пароль существующего пользователя при этом
    не меняется — только выдаются права.
    """
    email = settings.admin_email.strip().lower()
    password = settings.admin_password
    if not email or not password:
        logger.info("ADMIN_EMAIL/ADMIN_PASSWORD не заданы — вход в админку недоступен")
        return

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                email=email,
                password_hash=hash_password(password),
                full_name="Администратор",
                is_admin=True,
                email_verified=True,
            )
            db.add(user)
            logger.info("Создан администратор %s", email)
        elif not user.is_admin:
            user.is_admin = True
            logger.info("Пользователю %s выданы права администратора", email)
        db.commit()
