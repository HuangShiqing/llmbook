import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
BOOKS_DIR = BASE_DIR / "books"
USERS_FILE = BASE_DIR / "server" / "users.json"
FRONTEND_DIR = BASE_DIR / "frontend"

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 72

LITELLM_MODEL = os.getenv("LITELLM_MODEL", "openai/deepseek-reasoner")
LITELLM_API_KEY = os.getenv("LITELLM_API_KEY", "")
LITELLM_API_BASE = os.getenv("LITELLM_API_BASE", "https://api.deepseek.com")

WRITING_SYSTEM_PROMPT = """你是一个专业的写作助手。请根据用户的指令帮助撰写或修改书籍内容。

规则：
1. 当你要给出修改后的完整章节内容时，用 <content> 标签包裹整个内容，标签内只包含 Markdown 格式正文
2. 当你在讨论、回答问题、给建议时，正常回复文字，不要加 <content> 标签
3. <content> 内不要有任何解释、前言、问候或非正文内容，直接输出内容本身
4. 保持风格一致，语言流畅自然"""
