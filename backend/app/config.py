import logging
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# Корень репозитория: backend/app/config.py → parents[2].
REPO_ROOT = Path(__file__).resolve().parents[2]

# Единственный источник истины для локальной разработки — <корень репозитория>/.env.
# Путь абсолютный намеренно: относительный ".env" pydantic-settings резолвит от
# рабочего каталога процесса, а он разный (uvicorn стартует из backend/, скрипты —
# из корня). Переменные окружения процесса имеют приоритет над файлом — так
# задаются секреты на Render, где файла на этом пути нет вовсе.
ENV_FILE = REPO_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    # Core
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 7
    # SQLite по умолчанию — бэкенд запускается без установки Postgres.
    # На Render подставляется DATABASE_URL управляемого Postgres (см. render.yaml).
    database_url: str = "sqlite:///./bpm.db"
    cors_origins: str = "http://localhost:8080,http://127.0.0.1:8080"

    # Адрес фронтенда — для ссылок в письмах (подтверждение почты, сброс пароля).
    frontend_base_url: str = "http://localhost:8080"

    # SMTP для писем. Пока хост не задан — «dev-режим»: письмо не отправляется,
    # ссылка пишется в лог и возвращается в ответе API (только для локального демо).
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "BPM Platform <no-reply@bpm.local>"
    smtp_starttls: bool = True

    # Токены подтверждения почты и сброса пароля (часы жизни)
    verify_token_ttl_hours: int = 48
    reset_token_ttl_hours: int = 2

    # Админка на /admin (SQLAdmin поверх той же базы, что и API).
    # ADMIN_EMAIL + ADMIN_PASSWORD — первый администратор: создаётся или
    # повышается при старте (на Render нет shell для ручной команды).
    # Пока пароль не задан, вход в админку невозможен — так и должно быть.
    admin_enabled: bool = True
    admin_email: str = ""
    admin_password: str = ""
    admin_session_secret: str = ""  # по умолчанию берётся jwt_secret
    # Cookie сессии админки. Безопасное значение по умолчанию — только HTTPS;
    # для локальной разработки по http://localhost выставьте false в .env,
    # иначе браузер не отправит cookie и вход будет молча не срабатывать.
    admin_cookie_secure: bool = True
    admin_session_max_age: int = 60 * 60 * 8  # 8 часов вместо дефолтных 14 суток

    # Ограничение попыток входа (защита от перебора пароля).
    login_rate_limit_attempts: int = 8
    login_rate_limit_window_seconds: int = 300
    login_rate_limit_block_seconds: int = 900

    # LLM — единая точка замены провайдера (для госсектора: локальная модель в контуре).
    # Id моделей сверены с каталогом OpenRouter (те же проверенные значения,
    # что используются в проде Dalel AI, — несуществующие id падают 404 в рантайме).
    llm_provider: str = "openrouter"
    llm_model: str = "qwen/qwen3-235b-a22b-2507"
    llm_fallback_models: str = "meta-llama/llama-3.3-70b-instruct,deepseek/deepseek-chat-v3.1"
    llm_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_api_key: str = ""
    # deny — маршрутизировать запросы только к провайдерам, которые не хранят
    # и не обучаются на переданном тексте (через ассистента проходят внутренние
    # регламенты компании). Ценой может быть недоступность части бесплатных моделей.
    llm_data_collection: str = "deny"  # deny | allow

    # Платежи: mock (демо — платёж «оплачивается» сам, без реквизитов мерчанта)
    # | kaspi (боевой, реквизиты выдаёт Kaspi при онбординге мерчанта)
    payment_provider: str = "mock"
    mock_pay_delay_seconds: int = 9

    # Kaspi Pay
    kaspi_api_base: str = "https://mtokentest.kaspi.kz:8545/r3/v01"
    kaspi_api_key: str = ""
    kaspi_trade_point_id: str = ""
    kaspi_device_token: str = ""
    kaspi_cert_path: str = ""
    kaspi_cert_key_path: str = ""

    # Максимальный размер данных workspace (JSON-снимок процессов/матрицы), байт
    workspace_max_bytes: int = 2_000_000

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def admin_session_key(self) -> str:
        return self.admin_session_secret or self.jwt_secret

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host)


@lru_cache
def get_settings() -> Settings:
    if ENV_FILE.is_file():
        logger.info("Конфигурация: читаю %s", ENV_FILE)
    else:
        logger.warning(
            "Конфигурация: %s не найден — значения только из переменных окружения "
            "и значений по умолчанию (норма для Render)",
            ENV_FILE,
        )
    return Settings()


settings = get_settings()

ASSETS_DIR = Path(__file__).resolve().parent / "assets"
