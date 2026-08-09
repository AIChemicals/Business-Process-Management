"""Мок платёжного провайдера для локальной разработки и демо.

Внешних вызовов нет: платёж «оплачивается» сам через mock_pay_delay_seconds
после создания — фронтенд успевает показать QR-модал и дождаться success
по поллингу. Момент создания зашит в provider_payment_id, поэтому статус
корректно определяется и после перезапуска бэкенда.
"""
import time
from datetime import datetime, timedelta, timezone

from ...config import settings
from .base import CardCharge, CardDetails, CreatedPayment, PaymentProvider, PaymentStatus

# Тестовая карта отказа (как у Stripe): Luhn-валидна, но всегда decline.
DECLINE_CARD = "4000000000000002"


class MockPayProvider(PaymentProvider):
    name = "mock"

    def create_payment(self, amount_kzt: int, order_id: str, description: str) -> CreatedPayment:
        return CreatedPayment(
            provider_payment_id=f"mock-{int(time.time())}-{order_id}",
            qr_token=f"bpm-mock-pay://{order_id}?amount={amount_kzt}",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        )

    def get_status(self, provider_payment_id: str) -> PaymentStatus:
        try:
            created = int(provider_payment_id.split("-")[1])
        except (IndexError, ValueError):
            return PaymentStatus.FAILED
        if time.time() - created >= settings.mock_pay_delay_seconds:
            return PaymentStatus.SUCCESS
        return PaymentStatus.PENDING

    def charge_card(self, amount_kzt: int, order_id: str, description: str, card: CardDetails) -> CardCharge:
        if card.number == DECLINE_CARD:
            return CardCharge(
                provider_payment_id="",
                status=PaymentStatus.FAILED,
                decline_reason="Платёж отклонён банком-эмитентом (тестовая карта отказа)",
            )
        return CardCharge(
            provider_payment_id=f"mockcard-{int(time.time())}-{order_id}",
            status=PaymentStatus.SUCCESS,
        )
