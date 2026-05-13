import json
import os
import re
from dataclasses import dataclass
from pathlib import Path

from git import Repo
from git.exc import InvalidGitRepositoryError
from pypinyin import lazy_pinyin, Style

from ..config import BOOKS_DIR


def _get_repo() -> Repo:
    try:
        return Repo(BOOKS_DIR)
    except InvalidGitRepositoryError:
        repo = Repo.init(BOOKS_DIR)
        repo.config_writer().set_value("user", "name", "ebook-platform").release()
        repo.config_writer().set_value("user", "email", "ebook@local").release()
        return repo


def list_books() -> list[dict]:
    results = []
    if not BOOKS_DIR.exists():
        return results
    for item in sorted(BOOKS_DIR.iterdir()):
        meta_file = item / "book.json"
        if item.is_dir() and meta_file.exists():
            meta = json.loads(meta_file.read_text())
            results.append({"id": item.name, **meta})
    return results


def _title_to_slug(title: str) -> str:
    parts = lazy_pinyin(title, style=Style.NORMAL)
    slug = "-".join(parts)
    slug = re.sub(r"[^a-zA-Z0-9\-]", "", slug)
    slug = re.sub(r"-+", "-", slug).strip("-").lower()
    if not slug:
        slug = "book"
    return slug


def create_book(title: str) -> dict:
    base_id = _title_to_slug(title)
    book_id = base_id
    suffix = 2
    while (BOOKS_DIR / book_id).exists():
        book_id = f"{base_id}-{suffix}"
        suffix += 1
    book_dir = BOOKS_DIR / book_id
    book_dir.mkdir(parents=True)
    meta = {"title": title, "chapters": []}
    meta_file = book_dir / "book.json"
    meta_file.write_text(json.dumps(meta, indent=2, ensure_ascii=False))

    repo = _get_repo()
    repo.index.add([f"{book_id}/book.json"])
    repo.index.commit(f"创建书籍：{title}")
    return {"id": book_id, **meta}


def update_book(book_id: str, title: str | None = None) -> dict:
    meta_file = BOOKS_DIR / book_id / "book.json"
    if not meta_file.exists():
        raise FileNotFoundError(f"书籍 {book_id} 不存在")
    meta = json.loads(meta_file.read_text())
    if title is not None:
        meta["title"] = title
    meta_file.write_text(json.dumps(meta, indent=2, ensure_ascii=False))

    repo = _get_repo()
    repo.index.add([f"{book_id}/book.json"])
    repo.index.commit(f"更新书籍信息：{meta['title']}")
    return {"id": book_id, **meta}


def delete_book(book_id: str) -> None:
    book_dir = BOOKS_DIR / book_id
    if not book_dir.exists():
        raise FileNotFoundError(f"书籍 {book_id} 不存在")

    repo = _get_repo()
    files_to_remove = []
    for f in book_dir.rglob("*"):
        if f.is_file():
            files_to_remove.append(str(f.relative_to(BOOKS_DIR)))
            f.unlink()
    for d in sorted(book_dir.rglob("*"), reverse=True):
        if d.is_dir():
            d.rmdir()
    book_dir.rmdir()

    if files_to_remove:
        repo.index.remove(files_to_remove, working_tree=True)
    repo.index.commit(f"删除书籍：{book_id}")


def get_toc(book_id: str) -> dict:
    meta_file = BOOKS_DIR / book_id / "book.json"
    if not meta_file.exists():
        raise FileNotFoundError(f"书籍 {book_id} 不存在")
    meta = json.loads(meta_file.read_text())

    def mark_has_content(items):
        for item in items:
            children = item.get("children")
            if children:
                mark_has_content(children)
            else:
                file_path = BOOKS_DIR / book_id / f"{item['id']}.md"
                content = file_path.read_text().strip() if file_path.exists() else ""
                item["hasContent"] = content != "" and content != f"# {item['title']}"

    mark_has_content(meta.get("chapters", []))
    return meta


def get_chapter(book_id: str, chapter_id: str, commit: str | None = None) -> str:
    if commit:
        repo = _get_repo()
        rel_path = f"{book_id}/{chapter_id}.md"
        try:
            blob = repo.commit(commit).tree / rel_path
            return blob.data_stream.read().decode()
        except (KeyError, ValueError):
            raise FileNotFoundError(f"版本 {commit} 中未找到 {rel_path}")
    file_path = BOOKS_DIR / book_id / f"{chapter_id}.md"
    if not file_path.exists():
        raise FileNotFoundError(f"章节 {chapter_id} 不存在")
    return file_path.read_text()


def save_chapter(book_id: str, chapter_id: str, content: str, message: str) -> str:
    book_dir = BOOKS_DIR / book_id
    book_dir.mkdir(parents=True, exist_ok=True)
    file_path = book_dir / f"{chapter_id}.md"
    file_path.write_text(content)

    repo = _get_repo()
    rel_path = f"{book_id}/{chapter_id}.md"
    repo.index.add([rel_path])
    commit = repo.index.commit(message)
    return str(commit)


def add_chapter(book_id: str, chapter_id: str, title: str, content: str = "", parent_id: str | None = None) -> str:
    meta_file = BOOKS_DIR / book_id / "book.json"
    if not meta_file.exists():
        raise FileNotFoundError(f"书籍 {book_id} 不存在")
    meta = json.loads(meta_file.read_text())

    new_entry = {"id": chapter_id, "title": title}
    if parent_id:
        parent = _find_node(meta["chapters"], parent_id)
        if not parent:
            raise FileNotFoundError(f"父节点 {parent_id} 不存在")
        parent.setdefault("children", []).append(new_entry)
    else:
        meta["chapters"].append(new_entry)

    meta_file.write_text(json.dumps(meta, indent=2, ensure_ascii=False))

    file_path = BOOKS_DIR / book_id / f"{chapter_id}.md"
    file_path.write_text(content or f"# {title}\n")

    repo = _get_repo()
    repo.index.add([f"{book_id}/book.json", f"{book_id}/{chapter_id}.md"])
    commit = repo.index.commit(f"新增章节：{title}")
    return str(commit)


def _find_node(items: list[dict], node_id: str) -> dict | None:
    for item in items:
        if item["id"] == node_id:
            return item
        children = item.get("children", [])
        found = _find_node(children, node_id)
        if found:
            return found
    return None


def _remove_node(items: list[dict], node_id: str) -> bool:
    for i, item in enumerate(items):
        if item["id"] == node_id:
            items.pop(i)
            return True
        children = item.get("children", [])
        if _remove_node(children, node_id):
            return True
    return False


def _collect_leaf_ids(node: dict) -> list[str]:
    ids = []
    children = node.get("children", [])
    if children:
        for child in children:
            ids.extend(_collect_leaf_ids(child))
    else:
        ids.append(node["id"])
    return ids


def delete_chapter(book_id: str, chapter_id: str) -> str:
    meta_file = BOOKS_DIR / book_id / "book.json"
    if not meta_file.exists():
        raise FileNotFoundError(f"书籍 {book_id} 不存在")
    meta = json.loads(meta_file.read_text())

    node = _find_node(meta["chapters"], chapter_id)
    if not node:
        raise FileNotFoundError(f"章节 {chapter_id} 不存在")

    file_ids = _collect_leaf_ids(node)
    _remove_node(meta["chapters"], chapter_id)
    meta_file.write_text(json.dumps(meta, indent=2, ensure_ascii=False))

    repo = _get_repo()
    files_to_remove = []
    for fid in file_ids:
        file_path = BOOKS_DIR / book_id / f"{fid}.md"
        if file_path.exists():
            file_path.unlink()
            files_to_remove.append(f"{book_id}/{fid}.md")

    if files_to_remove:
        repo.index.remove(files_to_remove, working_tree=True)
    repo.index.add([f"{book_id}/book.json"])
    commit = repo.index.commit(f"删除章节：{chapter_id}")
    return str(commit)


def _collect_all_leaf_ids(items: list[dict]) -> set[str]:
    ids = set()
    for item in items:
        children = item.get("children", [])
        if children:
            ids.update(_collect_all_leaf_ids(children))
        else:
            ids.add(item["id"])
    return ids


def apply_toc(book_id: str, new_chapters: list[dict], message: str = None) -> str:
    meta_file = BOOKS_DIR / book_id / "book.json"
    if not meta_file.exists():
        raise FileNotFoundError(f"书籍 {book_id} 不存在")
    if not message:
        message = "调整目录"
    meta = json.loads(meta_file.read_text())

    old_ids = _collect_all_leaf_ids(meta["chapters"])
    new_ids = _collect_all_leaf_ids(new_chapters)

    added = new_ids - old_ids
    removed = old_ids - new_ids

    meta["chapters"] = new_chapters
    meta_file.write_text(json.dumps(meta, indent=2, ensure_ascii=False))

    repo = _get_repo()
    files_to_add = [f"{book_id}/book.json"]

    def _find_title(items, target_id):
        for item in items:
            if item["id"] == target_id:
                return item["title"]
            children = item.get("children", [])
            found = _find_title(children, target_id)
            if found is not None:
                return found
        return None

    for fid in added:
        title = _find_title(new_chapters, fid) or fid
        file_path = BOOKS_DIR / book_id / f"{fid}.md"
        if not file_path.exists():
            file_path.write_text(f"# {title}\n")
        files_to_add.append(f"{book_id}/{fid}.md")

    files_to_remove = []
    for fid in removed:
        file_path = BOOKS_DIR / book_id / f"{fid}.md"
        if file_path.exists():
            file_path.unlink()
            files_to_remove.append(f"{book_id}/{fid}.md")

    if files_to_remove:
        repo.index.remove(files_to_remove, working_tree=True)
    repo.index.add(files_to_add)
    commit = repo.index.commit(message)
    return str(commit)


def get_history(book_id: str, limit: int = 50) -> list[dict]:
    repo = _get_repo()
    results = []
    for commit in repo.iter_commits(paths=book_id, max_count=limit):
        results.append({
            "hash": str(commit),
            "short_hash": str(commit)[:7],
            "message": commit.message.strip(),
            "author": str(commit.author),
            "date": commit.committed_datetime.isoformat(),
        })
    return results


def get_diff(book_id: str, commit1: str, commit2: str) -> str:
    repo = _get_repo()
    c1 = repo.commit(commit1)
    c2 = repo.commit(commit2)
    return repo.git.diff(c1, c2, "--", book_id)
