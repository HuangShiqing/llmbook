FROM python:3.12-slim

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server/ /app/server/
COPY frontend/ /app/frontend/
COPY books/ /app/books/

RUN cd /app/books && git init && \
    git config user.name "ebook-platform" && \
    git config user.email "ebook@local" && \
    git add -A && git commit -m "初始化书籍内容" || true

EXPOSE 8000

CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
