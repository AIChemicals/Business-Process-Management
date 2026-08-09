import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models.user import User
from ..schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserOut,
    VerifyEmailRequest,
)
from ..security import create_access_token, get_current_user, hash_password, verify_password
from ..services import emailer
from ..services.emailer import EmailSendError
from ..services.quotas import get_or_create_subscription
from ..services.rate_limit import enforce, login_limiter
from ..services.tokens import consume_token, issue_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _issue_verification(db: Session, user: User) -> str | None:
    """Создаёт токен подтверждения и шлёт письмо. Возвращает dev-ссылку (SMTP не настроен)."""
    raw = issue_token(db, user.id, "verify", settings.verify_token_ttl_hours)
    try:
        return emailer.send_verification(user.email, raw)
    except EmailSendError:
        # Регистрацию не роняем из-за почтовика: пользователь запросит письмо повторно.
        logger.error("Письмо подтверждения для %s не отправлено", user.email)
        return None


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db)):
    # Регистрация тоже под лимитом: иначе через неё можно массово создавать
    # аккаунты и заодно выяснять, какие email уже заняты.
    key = enforce(request, "register")
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        login_limiter.register_failure(key)
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже зарегистрирован")
    user = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name.strip())
    db.add(user)
    db.commit()
    db.refresh(user)
    get_or_create_subscription(db, user)  # каждый новый пользователь стартует на тарифе free
    debug_link = _issue_verification(db, user)
    return TokenResponse(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user),
        email_debug_link=debug_link,
    )


@router.post("/login", response_model=TokenResponse)
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    key = enforce(request, "login")
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        login_limiter.register_failure(key)
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Аккаунт деактивирован")
    login_limiter.reset(key)  # успешный вход снимает накопленные неудачи
    return TokenResponse(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/verify-email", response_model=MessageResponse)
def verify_email(body: VerifyEmailRequest, db: Session = Depends(get_db)):
    user_id = consume_token(db, body.token, "verify")
    if user_id is None:
        raise HTTPException(status_code=400, detail="Ссылка подтверждения недействительна или устарела")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="Пользователь не найден")
    user.email_verified = True
    db.commit()
    return MessageResponse(detail="Почта подтверждена")


@router.post("/resend-verification", response_model=MessageResponse)
def resend_verification(
    request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    enforce(request, "resend")
    if user.email_verified:
        return MessageResponse(detail="Почта уже подтверждена")
    debug_link = _issue_verification(db, user)
    if debug_link:
        return MessageResponse(
            detail="SMTP не настроен — используйте ссылку ниже (только для демо)",
            email_debug_link=debug_link,
        )
    return MessageResponse(detail="Письмо с подтверждением отправлено")


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(request: Request, body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    # Ответ одинаковый существует пользователь или нет — иначе через форму можно
    # перебирать зарегистрированные адреса.
    enforce(request, "forgot")
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    debug_link = None
    if user is not None and user.is_active:
        raw = issue_token(db, user.id, "reset", settings.reset_token_ttl_hours)
        try:
            debug_link = emailer.send_password_reset(user.email, raw)
        except EmailSendError:
            raise HTTPException(status_code=502, detail="Не удалось отправить письмо — попробуйте позже")
    if debug_link:
        return MessageResponse(
            detail="SMTP не настроен — ссылка сброса ниже (только для демо)",
            email_debug_link=debug_link,
        )
    return MessageResponse(detail="Если такой адрес зарегистрирован, мы отправили на него письмо со ссылкой")


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(request: Request, body: ResetPasswordRequest, db: Session = Depends(get_db)):
    enforce(request, "reset")
    user_id = consume_token(db, body.token, "reset")
    if user_id is None:
        raise HTTPException(status_code=400, detail="Ссылка сброса недействительна или устарела")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=400, detail="Пользователь не найден")
    user.password_hash = hash_password(body.new_password)
    user.email_verified = True  # ссылка пришла на почту — адрес фактически подтверждён
    db.commit()
    return MessageResponse(detail="Пароль изменён — войдите с новым паролем")
