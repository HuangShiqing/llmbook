(function () {
    if (!requireAuth()) return;

    const bookId = getParam('book');
    if (!bookId) { window.location.href = '/bookshelf.html'; return; }
    let currentChapter = getParam('chapter');

    const tocList = document.getElementById('tocList');
    const bookTitle = document.getElementById('bookTitle');
    const chapterTitle = document.getElementById('chapterTitle');
    const content = document.getElementById('content');
    const editBtn = document.getElementById('editBtn');
    const historyBtn = document.getElementById('historyBtn');
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const userInfo = document.getElementById('userInfo');
    const logoutBtn = document.getElementById('logoutBtn');
    const aiTocToggle = document.getElementById('aiTocToggle');
    const aiTocPanel = document.getElementById('aiTocPanel');
    const aiTocClose = document.getElementById('aiTocClose');
    const aiTocPrompt = document.getElementById('aiTocPrompt');
    const aiTocGenerate = document.getElementById('aiTocGenerate');
    const aiTocPreview = document.getElementById('aiTocPreview');
    const aiTocApply = document.getElementById('aiTocApply');
    const aiTocCancel = document.getElementById('aiTocCancel');
    const aiTocStatus = document.getElementById('aiTocStatus');

    userInfo.textContent = getUsername() || '';
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        clearAuth();
        window.location.href = '/login.html';
    });

    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
    });
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    });

    historyBtn.href = `/history.html?book=${bookId}`;

    // Resize handle
    const resizeHandle = document.getElementById('resizeHandle');
    let isResizing = false;
    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizeHandle.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = Math.min(Math.max(e.clientX, 150), 500);
        sidebar.style.width = newWidth + 'px';
    });
    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        resizeHandle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });

    async function loadTOC() {
        const toc = await apiJSON(`/api/books/${bookId}/toc`);
        bookTitle.textContent = toc.title;
        document.title = toc.title;
        currentTocChapters = toc.chapters;
        tocList.innerHTML = '';
        renderTocItems(toc.chapters, tocList, 0);
        autoFitSidebar();

        if (!currentChapter) {
            const first = findFirstLeaf(toc.chapters);
            if (first) currentChapter = first.id;
        }
        if (currentChapter) {
            const ch = findChapter(toc.chapters, currentChapter);
            if (ch) loadChapter(ch.id, ch.title);
        }
    }

    function autoFitSidebar() {
        sidebar.style.width = 'auto';
        const links = sidebar.querySelectorAll('.toc-list a, .sidebar-title');
        let maxW = 0;
        links.forEach(el => {
            el.style.whiteSpace = 'nowrap';
            maxW = Math.max(maxW, el.scrollWidth);
        });
        const padding = parseFloat(getComputedStyle(sidebar).paddingLeft) + parseFloat(getComputedStyle(sidebar).paddingRight);
        const finalW = Math.min(Math.max(maxW + padding + 16, 150), 500);
        sidebar.style.width = finalW + 'px';
        links.forEach(el => { el.style.whiteSpace = ''; });
    }

    function renderTocItems(items, parentEl, depth) {
        items.forEach(ch => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = `/?book=${bookId}&chapter=${ch.id}`;
            a.textContent = ch.title;
            a.dataset.chapter = ch.id;
            if (depth > 0) a.style.paddingLeft = (0.8 + depth * 1.2) + 'rem';

            if (ch.children && ch.children.length) {
                a.classList.add('toc-group');
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    li.classList.toggle('collapsed');
                });
                li.appendChild(a);
                const subList = document.createElement('ul');
                subList.className = 'toc-list';
                renderTocItems(ch.children, subList, depth + 1);
                li.appendChild(subList);
            } else {
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    loadChapter(ch.id, ch.title);
                    history.pushState(null, '', `/?book=${bookId}&chapter=${ch.id}`);
                    sidebar.classList.remove('open');
                    overlay.classList.remove('open');
                });
                li.appendChild(a);
            }
            parentEl.appendChild(li);
        });
    }

    function findFirstLeaf(items) {
        for (const ch of items) {
            if (ch.children && ch.children.length) {
                const found = findFirstLeaf(ch.children);
                if (found) return found;
            } else {
                return ch;
            }
        }
        return null;
    }

    function findChapter(items, id) {
        for (const ch of items) {
            if (ch.id === id) return ch;
            if (ch.children) {
                const found = findChapter(ch.children, id);
                if (found) return found;
            }
        }
        return null;
    }

    async function loadChapter(chapterId, title) {
        currentChapter = chapterId;
        chapterTitle.textContent = title || chapterId;
        editBtn.href = `/editor.html?book=${bookId}&chapter=${chapterId}`;

        tocList.querySelectorAll('a').forEach(a => {
            a.classList.toggle('active', a.dataset.chapter === chapterId);
        });

        try {
            const data = await apiJSON(`/api/books/${bookId}/chapters/${chapterId}`);
            content.innerHTML = marked.parse(data.content);
        } catch (e) {
            content.innerHTML = `<p style="color:var(--pico-del-color);">${e.message}</p>`;
        }
    }

    // AI TOC Panel toggle
    aiTocToggle.addEventListener('click', () => {
        aiTocPanel.classList.toggle('open');
    });
    aiTocClose.addEventListener('click', () => {
        aiTocPanel.classList.remove('open');
    });

    // AI TOC multi-turn
    let pendingTOC = null;
    let tocChatHistory = [];
    let currentTocChapters = null;
    const aiTocMessages = document.getElementById('aiTocMessages');

    function appendTocMsg(role, text) {
        const div = document.createElement('div');
        div.className = 'chat-msg ' + role;
        div.textContent = text;
        aiTocMessages.appendChild(div);
        aiTocMessages.scrollTop = aiTocMessages.scrollHeight;
    }

    function countLeaves(items) {
        let n = 0;
        for (const item of items) {
            if (item.children && item.children.length) n += countLeaves(item.children);
            else n++;
        }
        return n;
    }

    function collectAllIds(items) {
        const ids = new Map();
        function walk(list) {
            for (const item of list) {
                ids.set(item.id, item.title);
                if (item.children) walk(item.children);
            }
        }
        walk(items);
        return ids;
    }

    function renderTocDiff(oldItems, newItems) {
        tocList.innerHTML = '';
        renderMergedDiff(oldItems, newItems, tocList, 0);
    }

    function renderMergedDiff(oldItems, newItems, parentEl, depth) {
        const oldIds = new Set(oldItems.map(i => i.id));
        const newMap = new Map(newItems.map(i => [i.id, i]));
        const rendered = new Set();

        // First pass: render old items in order, mark removed or show changes
        oldItems.forEach(oldCh => {
            if (newMap.has(oldCh.id)) {
                const newCh = newMap.get(oldCh.id);
                rendered.add(oldCh.id);
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = '#';
                a.addEventListener('click', e => e.preventDefault());
                if (depth > 0) a.style.paddingLeft = (0.8 + depth * 1.2) + 'rem';

                if (oldCh.title !== newCh.title) {
                    // Renamed: show old name as removed, new name as added
                    const aOld = document.createElement('a');
                    aOld.href = '#';
                    aOld.addEventListener('click', e => e.preventDefault());
                    aOld.textContent = '- ' + oldCh.title;
                    aOld.className = 'toc-diff-removed';
                    if (depth > 0) aOld.style.paddingLeft = (0.8 + depth * 1.2) + 'rem';
                    li.appendChild(aOld);

                    a.textContent = '+ ' + newCh.title;
                    a.className = 'toc-diff-added';
                } else {
                    a.textContent = newCh.title;
                    a.className = 'toc-diff-unchanged';
                }
                li.appendChild(a);

                // Recurse children
                const oldChildren = oldCh.children || [];
                const newChildren = newCh.children || [];
                if (oldChildren.length || newChildren.length) {
                    const subList = document.createElement('ul');
                    subList.className = 'toc-list';
                    renderMergedDiff(oldChildren, newChildren, subList, depth + 1);
                    li.appendChild(subList);
                }
                parentEl.appendChild(li);
            } else {
                // Removed node
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.textContent = '- ' + oldCh.title;
                a.className = 'toc-diff-removed';
                a.href = '#';
                a.addEventListener('click', e => e.preventDefault());
                if (depth > 0) a.style.paddingLeft = (0.8 + depth * 1.2) + 'rem';
                li.appendChild(a);
                parentEl.appendChild(li);
            }
        });

        // Second pass: render new items not in old (added), in their order
        newItems.forEach(newCh => {
            if (!rendered.has(newCh.id)) {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.textContent = '+ ' + newCh.title;
                a.className = 'toc-diff-added';
                a.href = '#';
                a.addEventListener('click', e => e.preventDefault());
                if (depth > 0) a.style.paddingLeft = (0.8 + depth * 1.2) + 'rem';
                li.appendChild(a);

                if (newCh.children && newCh.children.length) {
                    const subList = document.createElement('ul');
                    subList.className = 'toc-list';
                    renderMergedDiff([], newCh.children, subList, depth + 1);
                    li.appendChild(subList);
                }
                parentEl.appendChild(li);
            }
        });
    }

    function restoreTocView() {
        tocList.innerHTML = '';
        if (currentTocChapters) {
            renderTocItems(currentTocChapters, tocList, 0);
        }
    }

    aiTocCancel.addEventListener('click', () => {
        aiTocPreview.style.display = 'none';
        pendingTOC = null;
        restoreTocView();
    });

    aiTocGenerate.addEventListener('click', async () => {
        const prompt = aiTocPrompt.value.trim();
        if (!prompt) return;
        aiTocPrompt.value = '';
        aiTocGenerate.setAttribute('aria-busy', 'true');
        aiTocStatus.style.display = 'block';
        aiTocStatus.textContent = 'AI 生成中...';
        aiTocPreview.style.display = 'none';

        appendTocMsg('user', prompt);

        try {
            const data = await apiJSON('/api/ai/toc', {
                method: 'POST',
                body: JSON.stringify({ book_id: bookId, prompt, messages: tocChatHistory }),
            });
            pendingTOC = data.chapters;

            const summary = `已生成新目录（${data.chapters.length} 章，${countLeaves(data.chapters)} 节）`;
            appendTocMsg('ai', summary);

            tocChatHistory.push({ role: 'user', content: prompt });
            tocChatHistory.push({ role: 'assistant', content: JSON.stringify(data.chapters) });

            renderTocDiff(currentTocChapters, data.chapters);
            autoFitSidebar();
            aiTocPreview.style.display = 'block';
            aiTocStatus.style.display = 'none';
        } catch (e) {
            aiTocStatus.textContent = '生成失败：' + e.message;
            aiTocStatus.style.color = 'var(--pico-del-color)';
            appendTocMsg('ai', '生成失败：' + e.message);
        }
        aiTocGenerate.removeAttribute('aria-busy');
    });

    aiTocApply.addEventListener('click', async () => {
        if (!pendingTOC) return;
        aiTocApply.setAttribute('aria-busy', 'true');

        const userPrompts = tocChatHistory
            .filter(m => m.role === 'user')
            .map(m => {
                const text = m.content.length > 50 ? m.content.slice(0, 50) + '...' : m.content;
                return `- ${text}`;
            });
        const title = bookTitle.textContent || bookId;
        const message = `调整《${title}》目录\n${userPrompts.join('\n')}`;

        try {
            await apiJSON(`/api/books/${bookId}/toc`, {
                method: 'PUT',
                body: JSON.stringify({ chapters: pendingTOC, message }),
            });
            aiTocPreview.style.display = 'none';
            pendingTOC = null;
            tocChatHistory = [];
            aiTocMessages.innerHTML = '';
            currentChapter = null;
            loadTOC();
        } catch (e) {
            alert('应用失败：' + e.message);
        }
        aiTocApply.removeAttribute('aria-busy');
    });

    aiTocPrompt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            aiTocGenerate.click();
        }
    });

    loadTOC();
})();
