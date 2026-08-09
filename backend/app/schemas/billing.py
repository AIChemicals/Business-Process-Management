from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PlanOut(BaseModel):
    key: str
    name_ru: str
    name_kk: str
    price_kzt: int | None
    ai_requests_per_month: int | None
    docs_per_month: int | None
    is_enterprise: bool


class UsageOut(BaseModel):
    ai_requests: int
    docs: int


class SubscriptionOut(BaseModel):
    plan: str
    status: str
    current_period_end: datetime | None
    cancel_at_period_end: bool
    usage: UsageOut


class SubscribeRequest(BaseModel):
    plan: Literal["pro"]


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    provider: str
    amount_kzt: int
    plan: str
    status: str
    method: str
    card_brand: str
    card_last4: str
    qr_token: str
    payment_link: str
    expires_at: datetime | None
    created_at: datetime


class CardPayRequest(BaseModel):
    card_number: str = Field(pattern=r"^\d{12,19}$")
    holder: str = Field(min_length=2, max_length=64)
    exp_month: int = Field(ge=1, le=12)
    exp_year: int = Field(ge=2024, le=2050)
    cvv: str = Field(pattern=r"^\d{3,4}$")
