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


class TOCRequest(BaseModel):
    book_id: str
    prompt: str


async def _sse_stream(prompt: str, context: str):
    try:
        async for chunk in llm_service.generate_stream(prompt, context):
            data = json.dumps({"content": chunk}, ensure_ascii=False)
            yield f"data: {data}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as e:
        error = json.dumps({"error": str(e)}, ensure_ascii=False)
        yield f"data: {error}\n\n"


@router.post("/generate")
async def generate(req: GenerateRequest, _: str = Depends(get_current_user)):
    return StreamingResponse(
        _sse_stream(req.prompt, req.context),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/rewrite")
async def rewrite(req: GenerateRequest, _: str = Depends(get_current_user)):
    if not req.context:
        raise HTTPException(status_code=400, detail="修改内容时必须提供当前内容")
    return StreamingResponse(
        _sse_stream(req.prompt, req.context),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/toc")
async def ai_toc(req: TOCRequest, _: str = Depends(get_current_user)):
    toc = git_service.get_toc(req.book_id)
    current_json = json.dumps(toc["chapters"], ensure_ascii=False)
    result = await llm_service.generate_toc(current_json, req.prompt)
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
