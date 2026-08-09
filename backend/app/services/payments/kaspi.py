"""Интеграция с Kaspi Pay API (QR-платежи).

Схема (по документации интеграции Kaspi Pay для мерчантов):
- аутентификация: заголовок Api-Key + клиентский TLS-сертификат (mTLS),
  реквизиты и боевой хост выдаёт Kaspi при онбординге мерчанта;
- POST {base}/qr/create — создать QR-платёж (DeviceToken торговой точки),
  в ответе QrToken (рендерится в QR на фронтенде), QrPaymentId, срок действия;
- GET {base}/payment/status/{QrPaymentId} — статус платежа (поллинг).

Kaspi не присылает вебхуки в этом API — статусы поллятся с фронтенда.
"""
from datetime import datetime

import httpx

from ...config import settings
from .base import CreatedPayment, PaymentConfigError, PaymentProvider, PaymentProviderError, PaymentStatus

# Маппинг статусов Kaspi → внутренние статусы
_STATUS_MAP = {
    "Wait": PaymentStatus.PENDING,
    "QrTokenCreated": PaymentStatus.PENDING,
    "Processed": PaymentStatus.SUCCESS,
    "Error": PaymentStatus.FAILED,
    "Expired": PaymentStatus.EXPIRED,
}


class KaspiPayProvider(PaymentProvider):
    name = "kaspi"

    def __init__(self) -> None:
        self.base_url = settings.kaspi_api_base.rstrip("/")
        self.api_key = settings.kaspi_api_key
        self.trade_point_id = settings.kaspi_trade_point_id
        self.device_token = settings.kaspi_device_token

    def _client(self) -> httpx.Client:
        if not self.api_key or not self.device_token:
            raise PaymentConfigError(
                "Kaspi Pay не сконфигурирован: заполните KASPI_API_KEY, KASPI_TRADE_POINT_ID, "
                "KASPI_DEVICE_TOKEN (и сертификаты KASPI_CERT_*) в .env. "
                "Реквизиты выдаёт Kaspi при онбординге мерчанта."
            )
        cert = None
        if settings.kaspi_cert_path and settings.kaspi_cert_key_path:
            cert = (settings.kaspi_cert_path, settings.kaspi_cert_key_path)
        return httpx.Client(
            base_url=self.base_url,
            headers={"Api-Key": self.api_key, "Content-Type": "application/json"},
            cert=cert,
            timeout=30.0,
        )

    def create_payment(self, amount_kzt: int, order_id: str, description: str) -> CreatedPayment:
        with self._client() as client:
            data = self._call(
                client,
                "POST",
                "/qr/create",
                json={
                    "DeviceToken": self.device_token,
                    "Amount": amount_kzt,
                    "ExternalId": order_id,
                    "Comment": description[:250],
                },
            )
        expires_at = None
        expire_raw = data.get("ExpireDate")
        if expire_raw:
            try:
                expires_at = datetime.fromisoformat(str(expire_raw).replace("Z", "+00:00"))
            except ValueError:
                pass
        return CreatedPayment(
            provider_payment_id=str(data.get("QrPaymentId", "")),
            qr_token=str(data.get("QrToken", "")),
            payment_link=str(
                data.get("PaymentLink", "") or data.get("QrPaymentBehaviorOptions", {}).get("PaymentLink", "")
            ),
            expires_at=expires_at,
        )

    def get_status(self, provider_payment_id: str) -> PaymentStatus:
        with self._client() as client:
            data = self._call(client, "GET", f"/payment/status/{provider_payment_id}")
        raw = str(data.get("Status", "Wait"))
        return _STATUS_MAP.get(raw, PaymentStatus.PENDING)

    def _call(self, client: httpx.Client, method: str, path: str, **kwargs) -> dict:
        try:
            response = client.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            raise PaymentProviderError(f"Сбой обращения к Kaspi Pay: {exc}") from exc
        if response.status_code != 200:
            raise PaymentProviderError(
                f"Kaspi Pay вернул HTTP {response.status_code}: {response.text[:300]}"
            )
        body = response.json()
        # Kaspi отвечает {"StatusCode": 0, "Message": null, "Data": {...}}; StatusCode != 0 — ошибка
        if body.get("StatusCode", 0) != 0:
            raise PaymentProviderError(
                f"Ошибка Kaspi Pay (StatusCode={body.get('StatusCode')}): {body.get('Message')}"
            )
        return body.get("Data") or {}
