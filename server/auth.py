import json
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import JWT_ALGORITHM, JWT_EXPIRE_HOURS, JWT_SECRET, USERS_FILE

security = HTTPBearer()


def _load_users() -> dict:
    if not USERS_FILE.exists():
        return {}
    return json.loads(USERS_FILE.read_text())


def _save_users(users: dict):
    USERS_FILE.write_text(json.dumps(users, indent=2, ensure_ascii=False))


def create_user(username: str, password: str):
    users = _load_users()
    if username in users:
        raise ValueError("用户已存在")
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    users[username] = {"password": hashed}
    _save_users(users)


def verify_user(username: str, password: str) -> bool:
    users = _load_users()
    if username not in users:
        return False
    return bcrypt.checkpw(password.encode(), users[username]["password"].encode())


def create_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token 已过期")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="无效 Token")
