from collections.abc import AsyncGenerator

import litellm

from ..config import LITELLM_API_BASE, LITELLM_API_KEY, LITELLM_MODEL, WRITING_SYSTEM_PROMPT

if LITELLM_API_KEY:
    litellm.api_key = LITELLM_API_KEY

TOC_SYSTEM_PROMPT = """你是一个书籍目录结构编辑助手。用户会给你当前的目录结构（JSON）和修改指令。

规则：
1. 当你要给出修改后的目录结构时，用 ```json 代码块包裹完整的 JSON 数组
2. 当你在讨论、回答问题、给建议时，正常回复文字，不要输出 JSON 代码块
3. 每个节点有 id（英文标识，如 ch01、ch01-01）和 title（中文标题）
4. 分组节点用 children 数组包含子节点
5. 叶子节点（没有 children）对应实际的 .md 文件
6. 保留未被用户要求修改的已有节点的 id 不变，只对新增节点生成新 id
7. id 命名规范：章用 chXX，节用 chXX-YY

示例输出格式：
```json
[{"id":"ch01","title":"第1章 标题","children":[{"id":"ch01-01","title":"1.1 小节"}]}]
```"""


async def generate_stream(prompt: str, context: str = "", toc_info: str = "", history: list[dict] = None) -> AsyncGenerator[str, None]:
    messages = [{"role": "system", "content": WRITING_SYSTEM_PROMPT}]
    if toc_info:
        messages.append({"role": "user", "content": f"以下是本书的目录结构，请结合上下文进行写作：\n\n{toc_info}"})
        messages.append({"role": "assistant", "content": "好的，我已了解本书结构和当前章节位置。"})
    if context:
        messages.append({"role": "user", "content": f"以下是当前章节内容：\n\n{context}"})
        messages.append({"role": "assistant", "content": "好的，我已了解当前内容。请告诉我你需要什么修改。"})
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": prompt})

    kwargs = dict(model=LITELLM_MODEL, messages=messages, stream=True)
    if LITELLM_API_BASE:
        kwargs["base_url"] = LITELLM_API_BASE

    response = await litellm.acompletion(**kwargs)
    async for chunk in response:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content


async def generate_toc(current_toc_json: str, prompt: str, history: list[dict] = None) -> str:
    messages = [{"role": "system", "content": TOC_SYSTEM_PROMPT}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": f"当前目录结构：\n{current_toc_json}\n\n修改指令：{prompt}"})

    kwargs = dict(model=LITELLM_MODEL, messages=messages)
    if LITELLM_API_BASE:
        kwargs["base_url"] = LITELLM_API_BASE

    response = await litellm.acompletion(**kwargs)
    return response.choices[0].message.content
