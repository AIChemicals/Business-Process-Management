"""Разделы админки.

Принцип как в Dalel AI: то, что создаёт приложение (платежи, история ИИ,
workspaces), доступно на чтение и удаление, но не на создание руками.
Редактируется то, что реально правит оператор: права и статус пользователя,
тариф подписки, статус спорного платежа.
"""
from sqladmin import ModelView

from ..models.ai import AiMessage
from ..models.billing import Payment, Subscription
from ..models.token import AuthToken
from ..models.user import User
from ..models.workspace import Workspace


class UserAdmin(ModelView, model=User):
    name = "Пользователь"
    name_plural = "Пользователи"
    icon = "fa-solid fa-user"
    column_list = [User.id, User.email, User.full_name, User.email_verified, User.is_active, User.is_admin, User.created_at]
    column_searchable_list = [User.email, User.full_name]
    column_sortable_list = [User.id, User.created_at]
    form_columns = [User.email, User.full_name, User.email_verified, User.is_active, User.is_admin]
    can_create = False  # регистрация — только через API (пароль должен хешироваться)
    page_size = 50


class SubscriptionAdmin(ModelView, model=Subscription):
    name = "Подписка"
    name_plural = "Подписки"
    icon = "fa-solid fa-id-card"
    column_list = [
        Subscription.id,
        Subscription.user,
        Subscription.plan,
        Subscription.status,
        Subscription.current_period_end,
        Subscription.cancel_at_period_end,
    ]
    form_columns = [Subscription.plan, Subscription.status, Subscription.current_period_end, Subscription.cancel_at_period_end]
    can_create = False
    page_size = 50


class PaymentAdmin(ModelView, model=Payment):
    name = "Платёж"
    name_plural = "Платежи"
    icon = "fa-solid fa-coins"
    column_list = [
        Payment.id,
        Payment.user,
        Payment.provider,
        Payment.amount_kzt,
        Payment.plan,
        Payment.status,
        Payment.method,
        Payment.created_at,
    ]
    column_sortable_list = [Payment.id, Payment.created_at]
    form_columns = [Payment.status]  # оператор правит только статус спорного платежа
    can_create = False
    page_size = 50


class WorkspaceAdmin(ModelView, model=Workspace):
    name = "Workspace"
    name_plural = "Workspaces"
    icon = "fa-solid fa-diagram-project"
    column_list = [Workspace.id, Workspace.user, Workspace.updated_at]
    can_create = False
    can_edit = False  # JSON правится только приложением; оператору — просмотр и удаление
    page_size = 50


class AiMessageAdmin(ModelView, model=AiMessage):
    name = "Сообщение ИИ"
    name_plural = "История ИИ"
    icon = "fa-solid fa-robot"
    column_list = [AiMessage.id, AiMessage.user, AiMessage.role, AiMessage.kind, AiMessage.created_at]
    column_sortable_list = [AiMessage.id, AiMessage.created_at]
    can_create = False
    can_edit = False
    page_size = 50


class AuthTokenAdmin(ModelView, model=AuthToken):
    name = "Токен"
    name_plural = "Auth-токены"
    icon = "fa-solid fa-key"
    column_list = [AuthToken.id, AuthToken.user_id, AuthToken.purpose, AuthToken.expires_at, AuthToken.used_at]
    can_create = False
    can_edit = False  # хеши токенов не редактируются; удаление = отзыв ссылки
    page_size = 50


ALL_VIEWS = [UserAdmin, SubscriptionAdmin, PaymentAdmin, WorkspaceAdmin, AiMessageAdmin, AuthTokenAdmin]
