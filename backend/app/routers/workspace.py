import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models.user import User
from ..models.workspace import Workspace
from ..schemas.workspace import WorkspaceOut, WorkspacePutRequest
from ..security import get_current_user

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


def get_workspace_data(db: Session, user_id: int) -> dict:
    workspace = db.scalar(select(Workspace).where(Workspace.user_id == user_id))
    if workspace is None:
        return {}
    try:
        return json.loads(workspace.data)
    except ValueError:
        return {}


@router.get("", response_model=WorkspaceOut)
def read_workspace(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    workspace = db.scalar(select(Workspace).where(Workspace.user_id == user.id))
    if workspace is None:
        return WorkspaceOut(data=None, updated_at=None)
    try:
        data = json.loads(workspace.data)
    except ValueError:
        data = None
    return WorkspaceOut(data=data, updated_at=workspace.updated_at)


@router.put("", response_model=WorkspaceOut)
def save_workspace(
    body: WorkspacePutRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    raw = json.dumps(body.data, ensure_ascii=False)
    if len(raw.encode()) > settings.workspace_max_bytes:
        raise HTTPException(
            status_code=413,
            detail="Рабочее пространство слишком большое — очистите архив завершённых процессов",
        )
    workspace = db.scalar(select(Workspace).where(Workspace.user_id == user.id))
    if workspace is None:
        workspace = Workspace(user_id=user.id, data=raw)
        db.add(workspace)
    else:
        workspace.data = raw
    db.commit()
    db.refresh(workspace)
    return WorkspaceOut(data=body.data, updated_at=workspace.updated_at)
