# LLMBook — 把 AI 知识沉淀为书

向 AI 咨询是快速且全面了解一个新领域的好方式，但普通对话框并不适合承载长篇结构化内容——对话一长就难以回溯，知识散落在聊天记录里。LLMBook 将 AI 对话与书本形式结合：大纲整体可见，章节逐步展开，让 AI 生成的知识自然沉淀为一本可阅读、可修改、可追溯的电子书。

## 功能

- **书架管理**：创建、删除、浏览多本书籍
- **多级目录**：支持章/节层级结构，可折叠展开
- **AI 改内容**：与 AI 对话讨论写作方向，确认后 AI 输出修改内容，正文区实时显示 diff 预览，一键应用或取消
- **AI 改目录**：与 AI 对话调整目录结构，预览新增/删除/改名变更，确认后自动创建/删除对应 .md 文件
- **版本历史**：每次编辑自动 Git 提交，可查看历史、对比任意两个版本的 diff
- **JWT 认证**：注册/登录，多用户隔离
- **响应式布局**：桌面端侧边栏 + 移动端抽屉菜单

## 快速开始

### 环境要求

- Python 3.11+
- Git

### 安装依赖

```bash
cd llmbook
pip install -r server/requirements.txt
```

### 配置环境变量

```bash
export LITELLM_API_KEY="your-api-key"
# 可选：
# export LITELLM_MODEL="openai/deepseek-reasoner"
# export LITELLM_API_BASE="https://api.deepseek.com"
# export JWT_SECRET="your-secret-key"
```

### 初始化书籍仓库

```bash
cd books
git init
cd ..
```

### 启动服务

```bash
uvicorn server.main:app --host 0.0.0.0 --port 8000
```

访问 http://localhost:8000 ，注册账号后即可使用。

### Docker 部署

```bash
cd deploy
docker-compose up -d
```

## 使用流程

1. 注册/登录 → 进入书架
2. 新建书籍（输入书名，自动生成拼音 ID）
3. 进入阅读页，使用「AI改目录」规划章节结构
4. 选择章节，使用「AI改内容」撰写/修改内容
5. AI 面板支持先讨论再生成：直接提问 AI 会回复建议，明确要求修改时 AI 输出内容并展示 diff
6. 确认修改后自动保存并记录版本历史

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | FastAPI + Uvicorn |
| LLM | LiteLLM（默认 DeepSeek） |
| 版本控制 | GitPython |
| 前端 | Vanilla HTML/JS + Pico.css v2 |
| 数据存储 | 文件系统（JSON + Markdown + Git） |

## 项目结构

```
llmbook/
├── server/          # FastAPI 后端（认证、书籍 CRUD、AI 接口）
├── frontend/        # 零构建前端（HTML + JS + CSS）
├── books/           # 书籍数据（独立 Git 仓库）
└── deploy/          # Docker 部署配置
```

详细架构说明见 [ARCHITECTURE.md](ARCHITECTURE.md)。
