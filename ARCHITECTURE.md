# 电子书平台 — 架构文档

## 项目概述

AI 驱动的电子书写作与阅读平台，支持 Markdown 编写、AI 辅助写作、版本历史管理。零构建前端 + FastAPI 后端 + Git 版本控制。

---

## 技术栈

| 层 | 技术 |
|---|------|
| 后端框架 | FastAPI + Uvicorn |
| 认证 | JWT (PyJWT + bcrypt) |
| LLM 集成 | LiteLLM（默认 DeepSeek） |
| 版本控制 | GitPython |
| 前端 | Vanilla HTML/JS + Pico.css v2 (CDN) |
| Markdown 渲染 | marked.js (CDN) |
| Diff 展示 | diff2html (CDN) |
| 部署 | Docker + docker-compose |
| 数据存储 | 文件系统（JSON + Markdown + Git） |

---

## 目录结构

```
llmbook/
├── server/
│   ├── main.py              # FastAPI 入口，路由注册，静态文件挂载
│   ├── config.py            # 配置：路径、JWT、LLM 参数、系统提示词
│   ├── auth.py              # JWT 认证：注册/登录/Token验证
│   ├── users.json           # 用户数据（bcrypt 哈希密码）
│   ├── requirements.txt     # Python 依赖
│   ├── routers/
│   │   ├── book.py          # 书籍 CRUD API
│   │   └── ai.py            # AI 生成 API（SSE 流式 + TOC）
│   └── services/
│       ├── git_service.py   # Git 操作封装（读写/提交/历史/diff）
│       └── llm_service.py   # LiteLLM 调用封装
├── frontend/
│   ├── bookshelf.html       # 书架页（书籍列表、新建、删除）
│   ├── index.html           # 阅读页（目录 + 内容 + AI 目录调整）
│   ├── editor.html          # 编辑页（Markdown + AI 对话）
│   ├── history.html         # 版本历史（diff2html 对比）
│   ├── login.html           # 登录/注册
│   ├── css/style.css        # 响应式样式
│   └── js/
│       ├── api.js           # API 请求封装、Token 管理、SSE 客户端
│       ├── bookshelf.js     # 书架页逻辑
│       ├── app.js           # 阅读页逻辑
│       └── editor.js        # 编辑页逻辑
├── books/                   # [Git Submodule] 书籍数据独立仓库
│   └── my-first-book/
│       ├── book.json        # 书籍元数据 + 层级目录结构
│       └── *.md             # Markdown 章节文件
└── deploy/
    ├── Dockerfile
    └── docker-compose.yml
```

---

## 架构图

```
浏览器
  │
  ├── 静态文件（HTML/JS/CSS，由 FastAPI StaticFiles 提供）
  ├── REST API（JWT Bearer 认证）
  └── SSE 流式连接（AI 生成内容）
  │
FastAPI 应用 (server/main.py)
  │
  ├── Auth ─── users.json（bcrypt 密码，JWT Token）
  │
  ├── Book Router (/api/books)
  │       └── git_service ─── books/ 目录（独立 Git 仓库）
  │                           ├── book.json（目录结构）
  │                           └── *.md（章节内容）
  │
  └── AI Router (/api/ai)
          └── llm_service ─── LiteLLM ─── DeepSeek API
```

---

## API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录，返回 JWT Token |
| POST | `/api/auth/register` | 注册 |

### 书籍管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/books` | 书籍列表 |
| POST | `/api/books` | 新建书籍（id, title） |
| PUT | `/api/books/{book_id}` | 更新书籍信息（title） |
| DELETE | `/api/books/{book_id}` | 删除书籍及所有内容 |

### 书籍内容

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/books/{book_id}/toc` | 目录结构 |
| GET | `/api/books/{book_id}/chapters/{chapter_id}` | 章节内容（支持 `?commit=` 历史版本） |
| PUT | `/api/books/{book_id}/chapters/{chapter_id}` | 保存章节（自动 git commit） |
| POST | `/api/books/{book_id}/chapters` | 新增章节 |
| DELETE | `/api/books/{book_id}/chapters/{chapter_id}` | 删除章节及子章节 |
| PUT | `/api/books/{book_id}/toc` | 应用新目录结构（自动创建/删除 .md） |
| GET | `/api/books/{book_id}/history` | Git 提交历史 |
| GET | `/api/books/{book_id}/diff/{commit1}/{commit2}` | 两版本 diff |

### AI 生成

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/generate` | 流式生成内容（SSE，支持 `messages` 多轮对话，注入目录结构定位当前章节） |
| POST | `/api/ai/rewrite` | 流式改写内容（SSE，同上） |
| POST | `/api/ai/toc` | AI 调整目录结构（支持 `messages` 多轮对话历史，返回 JSON） |

---

## 数据存储设计

### 书籍数据

- 一本书 = 一个文件夹（`books/{book-id}/`）
- 目录结构存储在 `book.json`，支持多层嵌套（`children` 数组）
- 叶子节点对应实际的 `.md` 文件
- 整个 `books/` 是独立 Git 仓库（项目通过 submodule 引用）

**book.json 结构示例：**
```json
{
  "title": "书名",
  "chapters": [
    {
      "id": "ch01",
      "title": "第1章 标题",
      "children": [
        { "id": "ch01-01", "title": "1.1 小节" },
        { "id": "ch01-02", "title": "1.2 小节" }
      ]
    }
  ]
}
```

### 用户数据

- 存储在 `server/users.json`
- bcrypt 哈希密码，无数据库依赖

### 版本管理

- 每次编辑/AI 生成/目录调整自动 `git commit`
- 提交信息记录操作类型和操作者
- 书籍仓库独立于项目仓库，互不干扰

---

## 前端页面说明

### 书架页 (bookshelf.html)

- 书籍网格展示（卡片：书名、阅读/删除按钮）
- 新建书籍（输入 ID、标题）
- 删除书籍（二次确认）
- 登录后默认落地页

### 阅读页 (index.html)

- 左侧：可拖拽宽度的侧边栏（用户信息、书名、可折叠多级目录）
- 右侧：Markdown 渲染的章节内容
- 底部面板（默认收起）：AI 目录调整，支持多轮对话，生成后侧边栏显示 diff 树预览（绿色新增、红色删除线删除、改名显示为删旧增新两行）
- 移动端：汉堡菜单 + 侧边栏抽屉

### 编辑页 (editor.html)

- 左侧：Markdown 文本编辑器
- 右侧：AI 对话面板（SSE 流式输出，支持"应用到编辑器"）
- 支持预览（modal）和保存（触发 git commit）
- 移动端：tab 切换编辑器/AI 面板

### 历史页 (history.html)

- 提交列表（hash、时间、消息）
- 选择两个版本进行 diff2html 对比

---

## AI 能力

1. **内容生成/改写**：流式 SSE 返回，编辑页多轮对话交互，AI 自动获取全书目录结构并定位当前编辑章节，可一键应用到编辑器
2. **目录调整**：支持多轮对话，输入自然语言指令逐步细化目录结构。AI 返回新目录后，侧边栏实时显示 diff 树预览（新增/删除/改名），确认后应用（自动创建/删除对应 .md 文件）

---

## 配置方式

所有关键参数通过环境变量配置：

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `JWT_SECRET` | JWT 签名密钥 | `dev-secret-change-in-production` |
| `LITELLM_MODEL` | LLM 模型名 | `openai/deepseek-reasoner` |
| `LITELLM_API_KEY` | LLM API Key | （空） |
| `LITELLM_API_BASE` | LLM API 地址 | `https://api.deepseek.com` |

---

## 部署

```bash
# 本地开发
cd llmbook
uvicorn server.main:app --host 0.0.0.0 --port 8000

# Docker 部署
cd deploy
docker-compose up -d
```

Docker 部署通过 volume 挂载 `books/` 目录实现数据持久化。
