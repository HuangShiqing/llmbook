from collections.abc import AsyncGenerator

import litellm

from ..config import LITELLM_API_BASE, LITELLM_API_KEY, LITELLM_MODEL, WRITING_SYSTEM_PROMPT

if LITELLM_API_KEY:
    litellm.api_key = LITELLM_API_KEY

TOC_SYSTEM_PROMPT = """你是一个书籍目录结构编辑助手。用户会给你当前的目录结构（JSON）和修改指令。
你需要返回修改后的完整目录结构，格式为严格的 JSON。

规则：
1. 只输出 JSON，不要输出任何其他文字、解释或 markdown 代码块标记
2. 每个节点有 id（英文标识，如 ch01、ch01-01）和 title（中文标题）
3. 分组节点用 children 数组包含子节点
4. 叶子节点（没有 children）对应实际的 .md 文件
5. 保留未被用户要求修改的已有节点的 id 不变，只对新增节点生成新 id
6. id 命名规范：章用 chXX，节用 chXX-YY

示例输出格式：
[{"id":"ch01","title":"第1章 标题","children":[{"id":"ch01-01","title":"1.1 小节"}]}]"""


async def generate_stream(prompt: str, context: str = "") -> AsyncGenerator[str, None]:
    messages = [{"role": "system", "content": WRITING_SYSTEM_PROMPT}]
    if context:
        messages.append({"role": "user", "content": f"以下是当前章节内容：\n\n{context}"})
        messages.append({"role": "assistant", "content": "好的，我已了解当前内容。请告诉我你需要什么修改。"})
    messages.append({"role": "user", "content": prompt})

    kwargs = dict(model=LITELLM_MODEL, messages=messages, stream=True)
    if LITELLM_API_BASE:
        kwargs["base_url"] = LITELLM_API_BASE

    response = await litellm.acompletion(**kwargs)
    async for chunk in response:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content


async def generate_toc(current_toc_json: str, prompt: str) -> str:
    messages = [
        {"role": "system", "content": TOC_SYSTEM_PROMPT},
        {"role": "user", "content": f"当前目录结构：\n{current_toc_json}\n\n修改指令：{prompt}"},
    ]

    kwargs = dict(model=LITELLM_MODEL, messages=messages)
    if LITELLM_API_BASE:
        kwargs["base_url"] = LITELLM_API_BASE

    response = await litellm.acompletion(**kwargs)
    return response.choices[0].message.content
