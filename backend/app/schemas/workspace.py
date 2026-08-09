from datetime import datetime

from pydantic import BaseModel


class WorkspaceOut(BaseModel):
    data: dict | None
    updated_at: datetime | None


class WorkspacePutRequest(BaseModel):
    data: dict
