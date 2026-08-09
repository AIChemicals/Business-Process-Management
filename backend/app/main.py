from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .admin import ensure_admin_user, setup_admin
from .config import settings
from .database import init_db
from .routers import ai, auth, billing, docs, workspace


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # создаёт недостающие таблицы
    ensure_admin_user()  # админ из ADMIN_EMAIL/ADMIN_PASSWORD, если заданы
    yield


app = FastAPI(
    title="BPM Platform API",
    description="Бэкенд BPM-системы: аккаунты (подтверждение почты, восстановление пароля), "
    "тарифы и оплата, ИИ-ассистент по процессам, генерация регламентов DOCX/PDF, "
    "серверное хранение рабочих пространств.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    # Прод-сайт и preview-деплои фронтенда живут на *.vercel.app / *.netlify.app —
    # разрешаем их регуляркой, чтобы переименование сайта не ломало запросы к API.
    # Starlette матчит регулярку целиком (fullmatch), поэтому шаблон точный.
    allow_origin_regex=r"https://([a-z0-9-]+\.)*(vercel|netlify)\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

setup_admin(app)  # /admin — панель оператора поверх той же базы

app.include_router(auth.router)
app.include_router(workspace.router)
app.include_router(ai.router)
app.include_router(docs.router)
app.include_router(billing.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "bpm-platform"}
