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
1. 只输出 Markdown 格式的正文内容
2. 不要输出任何解释、前言、问候、总结或非正文内容
3. 不要说"好的"、"以下是"等引导语，直接输出内容本身
4. 保持风格一致，语言流畅自然"""
