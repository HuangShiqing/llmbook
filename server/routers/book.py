from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import get_current_user
from ..services import git_service

router = APIRouter(prefix="/api/books", tags=["books"])


@router.get("")
def list_books(_: str = Depends(get_current_user)):
    return git_service.list_books()


@router.get("/{book_id}/toc")
def get_toc(book_id: str, _: str = Depends(get_current_user)):
    try:
        return git_service.get_toc(book_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{book_id}/chapters/{chapter_id}")
def get_chapter(book_id: str, chapter_id: str, commit: str | None = None, _: str = Depends(get_current_user)):
    try:
        content = git_service.get_chapter(book_id, chapter_id, commit)
        return {"content": content}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


class SaveChapterRequest(BaseModel):
    content: str
    message: str = ""


@router.put("/{book_id}/chapters/{chapter_id}")
def save_chapter(book_id: str, chapter_id: str, req: SaveChapterRequest, user: str = Depends(get_current_user)):
    message = req.message or f"手动编辑：{chapter_id}"
    commit_hash = git_service.save_chapter(book_id, chapter_id, req.content, f"{message} (by {user})")
    return {"commit": commit_hash}


class AddChapterRequest(BaseModel):
    chapter_id: str
    title: str
    content: str = ""
    parent_id: str | None = None


@router.post("/{book_id}/chapters")
def add_chapter(book_id: str, req: AddChapterRequest, user: str = Depends(get_current_user)):
    try:
        commit_hash = git_service.add_chapter(book_id, req.chapter_id, req.title, req.content, req.parent_id)
        return {"commit": commit_hash}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{book_id}/chapters/{chapter_id}")
def delete_chapter(book_id: str, chapter_id: str, _: str = Depends(get_current_user)):
    try:
        commit_hash = git_service.delete_chapter(book_id, chapter_id)
        return {"commit": commit_hash}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


class ApplyTOCRequest(BaseModel):
    chapters: list


@router.put("/{book_id}/toc")
def apply_toc(book_id: str, req: ApplyTOCRequest, _: str = Depends(get_current_user)):
    try:
        commit_hash = git_service.apply_toc(book_id, req.chapters)
        return {"commit": commit_hash}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{book_id}/history")
def get_history(book_id: str, limit: int = 50, _: str = Depends(get_current_user)):
    return git_service.get_history(book_id, limit)


@router.get("/{book_id}/diff/{commit1}/{commit2}")
def get_diff(book_id: str, commit1: str, commit2: str, _: str = Depends(get_current_user)):
    diff_text = git_service.get_diff(book_id, commit1, commit2)
    return {"diff": diff_text}
