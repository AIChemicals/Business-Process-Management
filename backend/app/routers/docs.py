"""Генерация официальных документов: регламент процесса и отчёт по матрице.

Файлы не хранятся на диске (на Render он эфемерный) — DOCX/PDF собираются
в память в момент запроса и отдаются потоком.
"""
import io
import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.ai import AiMessage
from ..models.user import User
from ..security import get_current_user
from ..services.docgen import markdown_to_docx, markdown_to_pdf
from ..services.quotas import check_quota
from ..services.workspace_docs import build_matrix_markdown, build_regulation_markdown
from .workspace import get_workspace_data

router = APIRouter(prefix="/api/docs", tags=["docs"])

_MEDIA_TYPES = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
}


class RegulationRequest(BaseModel):
    template_id: str = Field(min_length=1, max_length=128)
    format: str = Field(default="docx", pattern="^(docx|pdf)$")
    lang: str = Field(default="ru", pattern="^(ru|kk|en)$")
    # Снимок с фронтенда — на случай, если workspace ещё не синхронизирован
    workspace: dict | None = None


class MatrixReportRequest(BaseModel):
    format: str = Field(default="docx", pattern="^(docx|pdf)$")
    lang: str = Field(default="ru", pattern="^(ru|kk|en)$")
    workspace: dict | None = None


def _ascii_filename(name: str, ext: str) -> str:
    # В Content-Disposition кладём ASCII-вариант: не-ASCII в заголовке ломает часть клиентов
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^A-Za-z0-9_-]+", "_", normalized).strip("_") or "document"
    return f"{slug[:60]}.{ext}"


def _respond(markdown: str, fmt: str, filename_base: str) -> StreamingResponse:
    content = markdown_to_docx(markdown) if fmt == "docx" else markdown_to_pdf(markdown)
    filename = _ascii_filename(filename_base, fmt)
    return StreamingResponse(
        io.BytesIO(content),
        media_type=_MEDIA_TYPES[fmt],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _load_workspace(db: Session, user: User, fallback: dict | None) -> dict:
    # Снимок из запроса приоритетнее серверной копии: клиент присылает актуальное
    # состояние, а серверная синхронизация отложенная и может отставать на секунды.
    workspace = fallback or get_workspace_data(db, user.id)
    if not workspace:
        raise HTTPException(status_code=400, detail="Рабочее пространство пусто — нечего выгружать")
    return workspace


@router.post("/regulation")
def regulation(body: RegulationRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_quota(db, user, "docs")
    workspace = _load_workspace(db, user, body.workspace)
    try:
        markdown, process_name = build_regulation_markdown(workspace, body.template_id, body.lang)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    db.add(AiMessage(user_id=user.id, role="user", kind="doc", content=f"regulation:{process_name}:{body.format}"))
    db.commit()
    return _respond(markdown, body.format, f"reglament_{process_name}")


@router.post("/matrix-report")
def matrix_report(body: MatrixReportRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_quota(db, user, "docs")
    workspace = _load_workspace(db, user, body.workspace)
    markdown = build_matrix_markdown(workspace, body.lang)
    db.add(AiMessage(user_id=user.id, role="user", kind="doc", content=f"matrix-report:{body.format}"))
    db.commit()
    return _respond(markdown, body.format, "role_function_matrix")
