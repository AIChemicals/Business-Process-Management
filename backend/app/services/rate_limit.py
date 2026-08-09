"""Ограничение попыток входа — защита от перебора пароля.

Счётчик живёт в памяти процесса: на free-тарифе Render инстанс один, Redis
там негде поднять. При масштабировании на несколько инстансов лимит станет
«на инстанс» и его нужно будет вынести в общее хранилище.

Считаем только неудачные попытки: успешный вход сбрасывает счётчик, поэтому
обычный пользователь, опечатавшийся пару раз, лимита не увидит.
"""
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from ..config import settings


class LoginRateLimiter:
    def __init__(self, *, attempts: int, window_seconds: int, block_seconds: int) -> None:
        self.attempts = attempts
        self.window = window_seconds
        self.block = block_seconds
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._blocked_until: dict[str, float] = {}
        # Эндпоинты синхронные (пул потоков uvicorn) — общие словари под блокировкой.
        self._lock = threading.Lock()

    def retry_after(self, key: str) -> int:
        """0 — можно пробовать; иначе сколько секунд ждать."""
        now = time.monotonic()
        with self._lock:
            until = self._blocked_until.get(key, 0.0)
            if until > now:
                return int(until - now) + 1
            if until:
                del self._blocked_until[key]
                self._failures.pop(key, None)
        return 0

    def register_failure(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            recent = self._failures[key]
            recent.append(now)
            while recent and now - recent[0] > self.window:
                recent.popleft()
            if len(recent) >= self.attempts:
                self._blocked_until[key] = now + self.block
                recent.clear()

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)
            self._blocked_until.pop(key, None)


login_limiter = LoginRateLimiter(
    attempts=settings.login_rate_limit_attempts,
    window_seconds=settings.login_rate_limit_window_seconds,
    block_seconds=settings.login_rate_limit_block_seconds,
)


def client_key(request: Request, scope: str) -> str:
    """Ключ лимита: IP клиента + область (login/register/admin/…).

    За обратным прокси (Render) реальный адрес приходит в X-Forwarded-For.
    Заголовок подделывается, поэтому лимит по IP — мера против простого
    перебора, а не против распределённой атаки.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    return f"{scope}:{ip}"


def enforce(request: Request, scope: str) -> str:
    """Проверяет лимит и возвращает ключ для последующего register_failure."""
    key = client_key(request, scope)
    wait = login_limiter.retry_after(key)
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Слишком много попыток. Повторите через {wait} с.",
            headers={"Retry-After": str(wait)},
        )
    return key
