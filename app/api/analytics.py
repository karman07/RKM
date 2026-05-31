"""
Analytics chat API — session-aware business intelligence endpoints.
Sessions stored in MongoDB collection: ai_analytics_sessions
"""
from datetime import datetime, timezone
from typing import Optional, List, Any

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.database import get_db
from app.services.analytics_agent import analytics_agent

router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _serialize(doc: dict) -> dict:
    """Convert ObjectId fields to strings for JSON serialisation."""
    doc["_id"] = str(doc["_id"])
    return doc


def _auto_title(text: str) -> str:
    """Generate a short session title from the first user message."""
    text = text.strip()
    return text[:60] + ("…" if len(text) > 60 else "")


# ─── Models ───────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None   # omit to start a new session


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    title: str
    charts: List[Any] = []


# ─── Chat ─────────────────────────────────────────────────────────────────────

@router.post("/analytics/chat", response_model=ChatResponse)
async def analytics_chat(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message cannot be empty")

    db = get_db()
    sessions = db["ai_analytics_sessions"]

    # Resolve or create session
    if req.session_id:
        try:
            oid = ObjectId(req.session_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid session_id")
        session = await sessions.find_one({"_id": oid})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        session = {
            "title": _auto_title(req.message),
            "messages": [],
            "created_at": _now(),
            "updated_at": _now(),
        }
        result = await sessions.insert_one(session)
        session["_id"] = result.inserted_id

    history = session.get("messages", [])

    # Run agent
    answer, charts = await analytics_agent.chat(req.message, history)

    # Persist both turns
    new_messages = [
        {"role": "user",      "content": req.message, "ts": _now()},
        {"role": "assistant", "content": answer,       "ts": _now()},
    ]
    await sessions.update_one(
        {"_id": session["_id"]},
        {"$push": {"messages": {"$each": new_messages}},
         "$set":  {"updated_at": _now()}},
    )

    return ChatResponse(
        session_id=str(session["_id"]),
        answer=answer,
        title=session["title"],
        charts=charts,
    )


# ─── Sessions ─────────────────────────────────────────────────────────────────

@router.get("/analytics/sessions")
async def list_sessions(limit: int = 30):
    db = get_db()
    sessions = db["ai_analytics_sessions"]
    docs = await sessions.find(
        {}, {"title": 1, "created_at": 1, "updated_at": 1, "messages": {"$slice": -1}}
    ).sort("updated_at", -1).limit(limit).to_list(limit)
    return [_serialize(d) for d in docs]


@router.get("/analytics/sessions/{session_id}")
async def get_session(session_id: str):
    db = get_db()
    sessions = db["ai_analytics_sessions"]
    try:
        oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")
    doc = await sessions.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    return _serialize(doc)


@router.delete("/analytics/sessions/{session_id}")
async def delete_session(session_id: str):
    db = get_db()
    sessions = db["ai_analytics_sessions"]
    try:
        oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")
    result = await sessions.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": True}
