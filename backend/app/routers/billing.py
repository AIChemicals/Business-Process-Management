from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.billing import Payment, Subscription
from ..models.user import User
from ..plans import PLANS, SUBSCRIPTION_PERIOD_DAYS
from ..schemas.billing import CardPayRequest, PaymentOut, PlanOut, SubscribeRequest, SubscriptionOut, UsageOut
from ..security import get_current_user
from ..services.payments import (
    PaymentConfigError,
    PaymentProviderError,
    PaymentStatus,
    get_payment_provider,
)
from ..services.payments.base import CardDetails
from ..services.payments.cards import detect_brand, luhn_valid
from ..services.quotas import effective_plan, get_or_create_subscription, month_usage

router = APIRouter(prefix="/api/billing", tags=["billing"])


def _apply_successful_payment(db: Session, payment: Payment) -> None:
    """Активирует оплаченный тариф на очередной период."""
    subscription = db.get(Subscription, payment.subscription_id)
    if subscription is None:
        return
    now = datetime.now(timezone.utc)
    subscription.plan = payment.plan
    subscription.status = "active"
    subscription.cancel_at_period_end = False
    subscription.current_period_start = now
    subscription.current_period_end = now + timedelta(days=SUBSCRIPTION_PERIOD_DAYS)


@router.get("/plans", response_model=list[PlanOut])
def list_plans():
    """Тарифная сетка — публичная (раздел «Тарифы»)."""
    return [PlanOut(key=key, **plan) for key, plan in PLANS.items()]


@router.get("/subscription", response_model=SubscriptionOut)
def my_subscription(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    subscription = get_or_create_subscription(db, user)
    return SubscriptionOut(
        plan=effective_plan(db, subscription),
        status=subscription.status,
        current_period_end=subscription.current_period_end,
        cancel_at_period_end=subscription.cancel_at_period_end,
        usage=UsageOut(**month_usage(db, user.id)),
    )


@router.post("/subscribe", response_model=PaymentOut)
def subscribe(body: SubscribeRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Создаёт платёж за выбранный тариф. Активация — после подтверждения оплаты."""
    subscription = get_or_create_subscription(db, user)
    plan = PLANS[body.plan]

    payment = Payment(
        user_id=user.id,
        subscription_id=subscription.id,
        amount_kzt=plan["price_kzt"],
        plan=body.plan,
    )
    db.add(payment)
    db.flush()

    try:
        provider = get_payment_provider()
        created = provider.create_payment(
            payment.amount_kzt,
            order_id=f"bpm-sub-{payment.id}",
            description=f"BPM Platform: тариф «{plan['name_ru']}», {SUBSCRIPTION_PERIOD_DAYS} дней",
        )
    except PaymentConfigError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(exc))
    except PaymentProviderError as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail=str(exc))

    payment.provider = provider.name
    payment.provider_payment_id = created.provider_payment_id
    payment.qr_token = created.qr_token
    payment.payment_link = created.payment_link
    payment.expires_at = created.expires_at
    db.commit()
    db.refresh(payment)
    return payment


@router.get("/payments", response_model=list[PaymentOut])
def payment_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Payment).where(Payment.user_id == user.id).order_by(Payment.id.desc()).limit(50)
    ).all()


@router.get("/payments/{payment_id}", response_model=PaymentOut)
def payment_status(payment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Статус платежа. Для pending — сверяется с провайдером (поллинг с фронтенда)."""
    payment = db.get(Payment, payment_id)
    if payment is None or payment.user_id != user.id:
        raise HTTPException(status_code=404, detail="Платёж не найден")

    if payment.status == "pending" and payment.provider_payment_id:
        try:
            status = get_payment_provider().get_status(payment.provider_payment_id)
        except PaymentProviderError:
            status = PaymentStatus.PENDING
        if status == PaymentStatus.SUCCESS:
            payment.status = "success"
            _apply_successful_payment(db, payment)
            db.commit()
        elif status in (PaymentStatus.FAILED, PaymentStatus.EXPIRED):
            payment.status = status.value
            db.commit()
    return payment


@router.post("/payments/{payment_id}/card", response_model=PaymentOut)
def pay_with_card(
    payment_id: int,
    body: CardPayRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Оплата ожидающего платежа банковской картой (Visa/Mastercard).

    Реквизиты карты уходят провайдеру транзитом — не сохраняются и не логируются
    (в базе остаются только бренд и последние 4 цифры).
    """
    payment = db.get(Payment, payment_id)
    if payment is None or payment.user_id != user.id:
        raise HTTPException(status_code=404, detail="Платёж не найден")
    if payment.status != "pending":
        raise HTTPException(status_code=400, detail="Платёж уже обработан")
    if not luhn_valid(body.card_number):
        raise HTTPException(status_code=422, detail="Неверный номер карты — проверьте цифры")
    now = datetime.now(timezone.utc)
    if (body.exp_year, body.exp_month) < (now.year, now.month):
        raise HTTPException(status_code=422, detail="Срок действия карты истёк")

    plan = PLANS[payment.plan]
    try:
        provider = get_payment_provider()
        charge = provider.charge_card(
            payment.amount_kzt,
            order_id=f"bpm-pay-{payment.id}",
            description=f"BPM Platform: тариф «{plan['name_ru']}», {SUBSCRIPTION_PERIOD_DAYS} дней",
            card=CardDetails(
                number=body.card_number,
                holder=body.holder,
                exp_month=body.exp_month,
                exp_year=body.exp_year,
                cvv=body.cvv,
            ),
        )
    except PaymentConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except PaymentProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if charge.status != PaymentStatus.SUCCESS:
        # Платёж остаётся pending: можно повторить другой картой или оплатить по QR
        raise HTTPException(status_code=402, detail=charge.decline_reason or "Платёж отклонён банком")

    payment.status = "success"
    payment.method = "card"
    payment.card_brand = detect_brand(body.card_number)
    payment.card_last4 = body.card_number[-4:]
    if charge.provider_payment_id:
        payment.provider_payment_id = charge.provider_payment_id
    _apply_successful_payment(db, payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.post("/cancel", response_model=SubscriptionOut)
def cancel_subscription(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Отмена в конце оплаченного периода (доступ сохраняется до его конца)."""
    subscription = get_or_create_subscription(db, user)
    if subscription.plan == "free":
        raise HTTPException(status_code=400, detail="У вас бесплатный тариф — отменять нечего")
    subscription.cancel_at_period_end = True
    db.commit()
    return my_subscription(user, db)
