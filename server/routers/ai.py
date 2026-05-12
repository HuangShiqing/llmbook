import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import get_current_user
from ..services import git_service, llm_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


class GenerateRequest(BaseModel):
    prompt: str
    context: str = ""
    book_id: str = ""
    chapter_id: str = ""
    messages: list[dict] = []


class TOCRequest(BaseModel):
    book_id: str
    prompt: str
    messages: list[dict] = []


async def _sse_stream(prompt: str, context: str, toc_info: str = "", history: list[dict] = None):
    try:
        async for chunk in llm_service.generate_stream(prompt, context, toc_info, history):
            data = json.dumps({"content": chunk}, ensure_ascii=False)
            yield f"data: {data}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as e:
        error = json.dumps({"error": str(e)}, ensure_ascii=False)
        yield f"data: {error}\n\n"


def _build_toc_info(book_id: str, chapter_id: str) -> str:
    if not book_id:
        return ""
    try:
        toc = git_service.get_toc(book_id)
    except FileNotFoundError:
        return ""
    lines = [f"书籍：{toc.get('title', book_id)}", "目录结构："]

    def walk(items, depth=0):
        for item in items:
            prefix = "  " * depth
            marker = " 【当前编辑】" if item["id"] == chapter_id else ""
            lines.append(f"{prefix}- {item['title']}{marker}")
            if item.get("children"):
                walk(item["children"], depth + 1)

    walk(toc["chapters"])
    return "\n".join(lines)


@router.post("/generate")
async def generate(req: GenerateRequest, _: str = Depends(get_current_user)):
    toc_info = _build_toc_info(req.book_id, req.chapter_id)
    return StreamingResponse(
        _sse_stream(req.prompt, req.context, toc_info, req.messages or None),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/rewrite")
async def rewrite(req: GenerateRequest, _: str = Depends(get_current_user)):
    if not req.context:
        raise HTTPException(status_code=400, detail="修改内容时必须提供当前内容")
    toc_info = _build_toc_info(req.book_id, req.chapter_id)
    return StreamingResponse(
        _sse_stream(req.prompt, req.context, toc_info, req.messages or None),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/toc")
async def ai_toc(req: TOCRequest, _: str = Depends(get_current_user)):
    toc = git_service.get_toc(req.book_id)
    current_json = json.dumps(toc["chapters"], ensure_ascii=False)
    result = await llm_service.generate_toc(current_json, req.prompt, req.messages)
    # Strip markdown code block markers if present
    result = result.strip()
    if result.startswith("```"):
        result = result.split("\n", 1)[1] if "\n" in result else result[3:]
    if result.endswith("```"):
        result = result[:-3].strip()
    try:
        new_chapters = json.loads(result)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail=f"AI 返回的格式无法解析：{result[:200]}")
    return {"chapters": new_chapters}
