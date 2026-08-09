from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=8000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)
    lang: str = Field(default="ru", pattern="^(ru|kk|en)$")


class ChatResponse(BaseModel):
    answer: str


class GenerateProcessRequest(BaseModel):
    description: str = Field(min_length=10, max_length=4000)
    lang: str = Field(default="ru", pattern="^(ru|kk|en)$")


class GenerateProcessResponse(BaseModel):
    template: dict
