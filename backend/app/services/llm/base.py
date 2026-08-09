"""Абстракция LLM-провайдера.

Единственная точка вызова языковых моделей во всём приложении. Для госсектора
(on-prem, данные не покидают контур заказчика) достаточно добавить класс с тем же
интерфейсом (например, VLLMProvider с локальным OpenAI-совместимым эндпоинтом)
и переключить LLM_PROVIDER в конфигурации.
"""
from abc import ABC, abstractmethod
from functools import lru_cache


class LLMError(Exception):
    """Ошибка вызова LLM (сеть, квоты, невалидный ответ)."""


class LLMProvider(ABC):
    @abstractmethod
    def complete(
        self,
        messages: list[dict],
        *,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        json_mode: bool = False,
    ) -> str:
        """Возвращает текст ответа модели для списка сообщений chat-формата."""


@lru_cache
def get_llm_provider() -> LLMProvider:
    from ...config import settings

    if settings.llm_provider == "openrouter":
        from .openrouter import OpenRouterProvider

        return OpenRouterProvider()
    raise LLMError(f"Неизвестный LLM-провайдер: {settings.llm_provider}")
