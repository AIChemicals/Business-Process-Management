"""Абстракция платёжного провайдера (схема как в Dalel AI).

mock — для демо и локальной разработки; kaspi — боевой. Halyk, CloudPayments
и др. добавляются новым классом с тем же интерфейсом + значением в конфиге,
без рефакторинга биллинговой логики.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from functools import lru_cache


class PaymentProviderError(Exception):
    """Ошибка вызова платёжного API."""


class PaymentConfigError(PaymentProviderError):
    """Провайдер не сконфигурирован (нет реквизитов мерчанта)."""


class PaymentStatus(str, Enum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    EXPIRED = "expired"


@dataclass
class CreatedPayment:
    provider_payment_id: str
    qr_token: str = ""
    payment_link: str = ""
    expires_at: datetime | None = None


@dataclass
class CardDetails:
    """Реквизиты карты. Только транзит до провайдера: не сохранять и не логировать."""

    number: str  # PAN, только цифры
    holder: str
    exp_month: int
    exp_year: int  # четырёхзначный
    cvv: str


@dataclass
class CardCharge:
    provider_payment_id: str
    status: PaymentStatus
    decline_reason: str = ""


class PaymentProvider(ABC):
    name: str

    @abstractmethod
    def create_payment(self, amount_kzt: int, order_id: str, description: str) -> CreatedPayment:
        """Создаёт платёж, возвращает QR-токен/ссылку для оплаты."""

    @abstractmethod
    def get_status(self, provider_payment_id: str) -> PaymentStatus:
        """Актуальный статус платежа у провайдера."""

    def charge_card(self, amount_kzt: int, order_id: str, description: str, card: CardDetails) -> CardCharge:
        """Списание с карты (Visa/Mastercard). По умолчанию не поддержано."""
        raise PaymentProviderError(
            f"Провайдер {self.name} не поддерживает оплату картой — подключите карточного эквайера"
        )


@lru_cache
def get_payment_provider() -> PaymentProvider:
    from ...config import settings

    if settings.payment_provider == "mock":
        from .mock import MockPayProvider

        return MockPayProvider()
    from .kaspi import KaspiPayProvider

    return KaspiPayProvider()
