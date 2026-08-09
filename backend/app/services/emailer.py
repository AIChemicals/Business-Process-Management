"""Отправка писем: подтверждение почты и восстановление пароля.

Пока SMTP_HOST не задан — «dev-режим»: письмо не отправляется, ссылка пишется
в лог и возвращается вызывающему коду (роутер отдаёт её в ответе API, чтобы
привязку почты можно было пройти в локальном демо без почтового сервера).
"""
import logging
import smtplib
from email.message import EmailMessage

from ..config import settings

logger = logging.getLogger(__name__)


class EmailSendError(Exception):
    pass


def _send(to: str, subject: str, body: str) -> None:
    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
            if settings.smtp_starttls:
                smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    except (smtplib.SMTPException, OSError) as exc:
        logger.error("Не удалось отправить письмо на %s: %s", to, exc)
        raise EmailSendError("Не удалось отправить письмо — проверьте настройки SMTP") from exc


def send_verification(to: str, token: str) -> str | None:
    """Отправляет ссылку подтверждения. Возвращает dev-ссылку, если SMTP не настроен."""
    link = f"{settings.frontend_base_url.rstrip('/')}/?verify_token={token}"
    if not settings.smtp_configured:
        logger.warning("SMTP не настроен — ссылка подтверждения для %s: %s", to, link)
        return link
    _send(
        to,
        "Подтверждение почты — BPM Platform",
        "Здравствуйте!\n\n"
        "Вы указали этот адрес при регистрации в BPM-платформе.\n"
        f"Для подтверждения почты перейдите по ссылке:\n\n{link}\n\n"
        f"Ссылка действует {settings.verify_token_ttl_hours} ч. "
        "Если вы не регистрировались — просто проигнорируйте это письмо.",
    )
    return None


def send_password_reset(to: str, token: str) -> str | None:
    """Отправляет ссылку сброса пароля. Возвращает dev-ссылку, если SMTP не настроен."""
    link = f"{settings.frontend_base_url.rstrip('/')}/?reset_token={token}"
    if not settings.smtp_configured:
        logger.warning("SMTP не настроен — ссылка сброса пароля для %s: %s", to, link)
        return link
    _send(
        to,
        "Восстановление пароля — BPM Platform",
        "Здравствуйте!\n\n"
        "Поступил запрос на восстановление пароля вашего аккаунта.\n"
        f"Чтобы задать новый пароль, перейдите по ссылке:\n\n{link}\n\n"
        f"Ссылка действует {settings.reset_token_ttl_hours} ч. "
        "Если это были не вы — проигнорируйте письмо, пароль не изменится.",
    )
    return None
