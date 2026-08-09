"""Тарифная сетка (KZT в месяц).

Лимиты — число операций в календарный месяц; None = без лимита
(enterprise, по договору).
"""

PLANS: dict[str, dict] = {
    "free": {
        "name_ru": "Бесплатный",
        "name_kk": "Тегін",
        "price_kzt": 0,
        "ai_requests_per_month": 15,
        "docs_per_month": 3,
        "is_enterprise": False,
    },
    "pro": {
        "name_ru": "Профессиональный",
        "name_kk": "Кәсіби",
        "price_kzt": 9_990,
        "ai_requests_per_month": 300,
        "docs_per_month": 100,
        "is_enterprise": False,
    },
    "enterprise": {
        "name_ru": "Корпоративный / Госсектор",
        "name_kk": "Корпоративтік / Мемсектор",
        "price_kzt": None,  # по запросу: on-premise, изоляция данных, SLA
        "ai_requests_per_month": None,
        "docs_per_month": None,
        "is_enterprise": True,
    },
}

PAID_PLANS = {"pro"}

SUBSCRIPTION_PERIOD_DAYS = 30
