from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .auth import create_token, create_user, verify_user
from .config import FRONTEND_DIR, USERS_FILE
from .routers import ai, book

app = FastAPI(title="电子书平台")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
def login(req: LoginRequest):
    if not verify_user(req.username, req.password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_token(req.username)
    return {"token": token, "username": req.username}


@app.post("/api/auth/register")
def register(req: LoginRequest):
    try:
        create_user(req.username, req.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    token = create_token(req.username)
    return {"token": token, "username": req.username}


app.include_router(book.router)
app.include_router(ai.router)

app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
