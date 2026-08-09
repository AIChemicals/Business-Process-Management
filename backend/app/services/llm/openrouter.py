import time

import httpx

from ...config import settings
from .base import LLMError, LLMProvider

# Коды, при которых имеет смысл повторить запрос (перегрузка/временная ошибка).
_RETRYABLE = {408, 409, 429, 500, 502, 503, 504}
_MAX_ATTEMPTS = 3


class OpenRouterProvider(LLMProvider):
    """OpenAI-совместимый chat/completions через OpenRouter.

    Устойчивость к rate-limit бесплатных моделей:
    - передаём список моделей (`models`) — OpenRouter сам переключится на
      следующую, если основная перегружена;
    - повторяем запрос до _MAX_ATTEMPTS раз с нарастающей паузой.
    """

    def __init__(self) -> None:
        self.base_url = settings.llm_base_url.rstrip("/")
        self.api_key = settings.openrouter_api_key
        # основная модель + запасные, без дублей, с сохранением порядка
        candidates = [settings.llm_model] + [
            m.strip() for m in settings.llm_fallback_models.split(",") if m.strip()
        ]
        seen: set[str] = set()
        self.models = [m for m in candidates if not (m in seen or seen.add(m))]

    def complete(
        self,
        messages: list[dict],
        *,
        temperature: float = 0.3,
        max_tokens: int = 4096,
        json_mode: bool = False,
    ) -> str:
        if not self.api_key:
            raise LLMError("OPENROUTER_API_KEY не задан. Укажите ключ в .env")

        payload: dict = {
            "models": self.models,  # список для авто-фолбэка на стороне OpenRouter
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        # Через ассистента проходят внутренние регламенты компании — просим
        # OpenRouter маршрутизировать запрос только к провайдерам, которые не
        # хранят переданный текст и не обучаются на нём.
        if settings.llm_data_collection.strip().lower() == "deny":
            payload["provider"] = {"data_collection": "deny"}

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://business-process-management.vercel.app",
            "X-Title": "BPM Platform",
        }

        last_error = "неизвестная ошибка"
        for attempt in range(_MAX_ATTEMPTS):
            try:
                response = httpx.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=180.0,
                )
            except httpx.HTTPError as exc:
                last_error = f"сбой сети: {exc}"
                time.sleep(1.5 * (attempt + 1))
                continue

            if response.status_code == 200:
                return self._extract(response.json())

            last_error = f"HTTP {response.status_code}: {response.text[:300]}"
            if response.status_code in _RETRYABLE and attempt < _MAX_ATTEMPTS - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            break

        # Все попытки исчерпаны — понятное сообщение для пользователя
        if "429" in last_error:
            raise LLMError(
                "Модель ИИ сейчас перегружена (много запросов). "
                "Попробуйте ещё раз через минуту."
            )
        raise LLMError(f"LLM недоступен: {last_error}")

    @staticmethod
    def _extract(data: dict) -> str:
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise LLMError(f"Неожиданный формат ответа LLM: {data}") from exc
        if not content or not content.strip():
            raise LLMError("LLM вернул пустой ответ")
        return content.strip()
