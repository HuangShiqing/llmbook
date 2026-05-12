(function () {
    if (!requireAuth()) return;

    const bookGrid = document.getElementById('bookGrid');
    const createBookBtn = document.getElementById('createBookBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        clearAuth();
        window.location.href = '/login.html';
    });

    async function loadBooks() {
        try {
            const books = await apiJSON('/api/books');
            if (!books.length) {
                bookGrid.innerHTML = '<p>还没有书籍，点击"新建书籍"开始创作。</p>';
                return;
            }
            bookGrid.innerHTML = '';
            books.forEach(book => {
                const card = document.createElement('article');
                card.className = 'book-card';
                card.innerHTML = `
                    <h3>${book.title}</h3>
                    <div class="book-card-actions">
                        <a href="/?book=${book.id}" role="button" class="outline">阅读</a>
                        <button class="outline secondary delete-btn" data-id="${book.id}" data-title="${book.title}">删除</button>
                    </div>
                `;
                bookGrid.appendChild(card);
            });
            bookGrid.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', () => deleteBook(btn.dataset.id, btn.dataset.title));
            });
        } catch (e) {
            bookGrid.innerHTML = `<p style="color:var(--pico-del-color);">${e.message}</p>`;
        }
    }

    createBookBtn.addEventListener('click', async () => {
        const title = prompt('书籍标题：');
        if (!title) return;

        try {
            await apiJSON('/api/books', {
                method: 'POST',
                body: JSON.stringify({ title }),
            });
            loadBooks();
        } catch (e) {
            alert('创建失败：' + e.message);
        }
    });

    async function deleteBook(bookId, title) {
        if (!confirm(`确定删除书籍「${title}」及其所有内容？此操作不可恢复。`)) return;
        try {
            await apiJSON(`/api/books/${bookId}`, { method: 'DELETE' });
            loadBooks();
        } catch (e) {
            alert('删除失败：' + e.message);
        }
    }

    loadBooks();
})();
