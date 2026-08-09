import json
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.ai import AiMessage
from ..models.user import User
from ..prompts import ASSISTANT_SYSTEM, PROCESS_GENERATOR_SYSTEM
from ..schemas.ai import ChatRequest, ChatResponse, GenerateProcessRequest, GenerateProcessResponse
from ..security import get_current_user
from ..services.llm import LLMError, get_llm_provider
from ..services.quotas import check_quota
from ..services.workspace_docs import pick_name, workspace_summary_for_ai
from .workspace import get_workspace_data

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/chat", response_model=ChatResponse)
def chat(body: ChatRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Ассистент по процессам: отвечает с опорой на workspace и официальные источники."""
    check_quota(db, user, "ai_requests")

    workspace = get_workspace_data(db, user.id)
    messages: list[dict] = [
        {"role": "system", "content": ASSISTANT_SYSTEM},
        {
            "role": "system",
            "content": "Сводка рабочего пространства пользователя:\n" + workspace_summary_for_ai(workspace, body.lang),
        },
    ]
    messages += [{"role": m.role, "content": m.content} for m in body.history[-10:]]
    messages.append({"role": "user", "content": body.message})

    db.add(AiMessage(user_id=user.id, role="user", kind="chat", content=body.message))
    db.commit()  # вопрос учитывается в квоте до вызова LLM — иначе ретраями можно её обойти

    try:
        answer = get_llm_provider().complete(messages, temperature=0.3, max_tokens=2048)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    db.add(AiMessage(user_id=user.id, role="assistant", kind="chat", content=answer))
    db.commit()
    return ChatResponse(answer=answer)


def _normalize_template(raw: dict, workspace: dict, lang: str) -> dict:
    """Валидация и нормализация JSON от LLM в формат шаблона фронтенда.

    LLM возвращает роли текстом — сопоставляем их с ролями workspace по имени;
    несопоставленные получают первую роль справочника. Координаты узлов
    раскладываем сеткой слева направо, как ждёт SVG-канвас модельера.
    """
    nodes_in = raw.get("nodes")
    conns_in = raw.get("connections")
    if not isinstance(nodes_in, list) or not isinstance(conns_in, list) or not nodes_in:
        raise ValueError("нет nodes/connections")

    roles = workspace.get("roles", [])
    default_role = roles[0]["id"] if roles else "role_initiator"

    def match_role(name: str) -> str:
        if not name:
            return default_role
        lowered = str(name).lower()
        for role in roles:
            for key in ("nameRu", "nameKk", "nameEn"):
                candidate = str(role.get(key, "")).lower()
                if candidate and (candidate in lowered or lowered in candidate):
                    return role["id"]
        return default_role

    stamp = int(time.time())
    known_ids: set[str] = set()
    nodes: list[dict] = []
    types_seen: list[str] = []
    for i, node in enumerate(nodes_in[:20]):
        node_type = node.get("type") if node.get("type") in {"start", "task", "gateway", "external", "end"} else "task"
        node_id = str(node.get("id") or f"node_{stamp}_{i}")
        known_ids.add(node_id)
        types_seen.append(node_type)
        out = {
            "id": node_id,
            "type": node_type,
            "nameRu": str(node.get("nameRu") or node.get("name") or f"Шаг {i}")[:120],
            "nameKk": str(node.get("nameKk") or node.get("nameRu") or f"Қадам {i}")[:120],
            "nameEn": str(node.get("nameEn") or node.get("nameRu") or f"Step {i}")[:120],
            "x": 60 + (i % 6) * 150,
            "y": 60 + (i // 6) * 130 + (35 if node_type in {"start", "end"} else 0),
        }
        if node_type in {"task", "external"}:
            out["roleId"] = match_role(node.get("role") or node.get("roleId"))
            try:
                out["sla"] = max(1, min(720, int(node.get("sla", 24))))
            except (TypeError, ValueError):
                out["sla"] = 24
        if node_type == "gateway":
            out["condition"] = str(node.get("condition") or "budget > 1000000")[:200]
            out["targetYes"] = str(node.get("targetYes") or "")
            out["targetNo"] = str(node.get("targetNo") or "")
        nodes.append(out)

    if types_seen.count("start") != 1 or "end" not in types_seen:
        raise ValueError("в шаблоне должен быть ровно один start и хотя бы один end")

    connections = []
    for conn in conns_in[:40]:
        src, dst = str(conn.get("from", "")), str(conn.get("to", ""))
        if src in known_ids and dst in known_ids and src != dst:
            entry = {"from": src, "to": dst}
            if conn.get("label"):
                entry["label"] = str(conn["label"])[:60]
            connections.append(entry)
    if not connections:
        raise ValueError("нет валидных соединений")

    # Цели шлюзов должны существовать, иначе движок упрётся в тупик
    for node in nodes:
        if node["type"] == "gateway":
            targets = [c["to"] for c in connections if c["from"] == node["id"]]
            if node["targetYes"] not in known_ids:
                node["targetYes"] = targets[0] if targets else ""
            if node["targetNo"] not in known_ids:
                node["targetNo"] = targets[1] if len(targets) > 1 else node["targetYes"]

    return {
        "id": f"proc_ai_{stamp}",
        "nameRu": str(raw.get("nameRu") or "Новый процесс")[:160],
        "nameKk": str(raw.get("nameKk") or raw.get("nameRu") or "Жаңа процесс")[:160],
        "nameEn": str(raw.get("nameEn") or raw.get("nameRu") or "New process")[:160],
        "version": "1.0",
        "generatedByAi": True,
        "nodes": nodes,
        "connections": connections,
    }


@router.post("/generate-process", response_model=GenerateProcessResponse)
def generate_process(
    body: GenerateProcessRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Генерирует BPMN-шаблон процесса из текстового описания."""
    check_quota(db, user, "ai_requests")
    workspace = get_workspace_data(db, user.id)

    role_names = "; ".join(
        pick_name(r, body.lang) for r in workspace.get("roles", [])[:30]
    ) or "справочник ролей пуст"
    messages = [
        {"role": "system", "content": PROCESS_GENERATOR_SYSTEM},
        {"role": "system", "content": f"Роли в справочнике пользователя: {role_names}"},
        {"role": "user", "content": body.description},
    ]

    db.add(AiMessage(user_id=user.id, role="user", kind="generate", content=body.description))
    db.commit()

    try:
        raw_answer = get_llm_provider().complete(messages, temperature=0.2, max_tokens=3000, json_mode=True)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    try:
        parsed = json.loads(raw_answer)
        template = _normalize_template(parsed, workspace, body.lang)
    except (ValueError, TypeError, KeyError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"ИИ вернул некорректную модель процесса ({exc}). Попробуйте переформулировать описание.",
        )

    db.add(AiMessage(user_id=user.id, role="assistant", kind="generate", content=json.dumps(template, ensure_ascii=False)))
    db.commit()
    return GenerateProcessResponse(template=template)
