(function () {
    if (!requireAuth()) return;

    const bookId = getParam('book');
    if (!bookId) { window.location.href = '/bookshelf.html'; return; }
    let currentChapter = getParam('chapter');

    const tocList = document.getElementById('tocList');
    const bookTitle = document.getElementById('bookTitle');
    const chapterTitle = document.getElementById('chapterTitle');
    const content = document.getElementById('content');
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

    let originalContent = '';

    async function loadChapter(chapterId, title) {
        currentChapter = chapterId;
        chapterTitle.textContent = title || chapterId;

        tocList.querySelectorAll('a').forEach(a => {
            a.classList.toggle('active', a.dataset.chapter === chapterId);
        });

        try {
            const data = await apiJSON(`/api/books/${bookId}/chapters/${chapterId}`);
            originalContent = data.content;
            content.innerHTML = marked.parse(data.content);
        } catch (e) {
            originalContent = '';
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
    let tocActionMsg = null;
    const aiTocMessages = document.getElementById('aiTocMessages');

    function appendTocMsg(role, text) {
        const div = document.createElement('div');
        div.className = 'chat-msg ' + role;
        div.textContent = text;
        aiTocMessages.appendChild(div);
        aiTocMessages.scrollTop = aiTocMessages.scrollHeight;
        return div;
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

    function appendTocActions() {
        if (tocActionMsg) tocActionMsg.remove();
        const div = document.createElement('div');
        div.className = 'chat-msg ai';
        div.innerHTML = '<span style="font-size:0.85rem;">左侧目录已显示变更预览</span>';
        const actions = document.createElement('div');
        actions.className = 'ai-toc-actions';
        actions.style.marginTop = '0.4rem';
        const applyBtn = document.createElement('button');
        applyBtn.textContent = '应用';
        applyBtn.addEventListener('click', applyToc);
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.className = 'outline secondary';
        cancelBtn.addEventListener('click', cancelToc);
        actions.appendChild(applyBtn);
        actions.appendChild(cancelBtn);
        div.appendChild(actions);
        aiTocMessages.appendChild(div);
        aiTocMessages.scrollTop = aiTocMessages.scrollHeight;
        tocActionMsg = div;
    }

    function cancelToc() {
        if (tocActionMsg) { tocActionMsg.remove(); tocActionMsg = null; }
        pendingTOC = null;
        restoreTocView();
    }

    async function applyToc() {
        if (!pendingTOC) return;

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
            pendingTOC = null;
            tocChatHistory = [];
            aiTocMessages.innerHTML = '';
            tocActionMsg = null;
            currentChapter = null;
            loadTOC();
        } catch (e) {
            alert('应用失败：' + e.message);
        }
    }

    aiTocGenerate.addEventListener('click', async () => {
        const prompt = aiTocPrompt.value.trim();
        if (!prompt) return;
        aiTocPrompt.value = '';
        aiTocGenerate.disabled = true;
        if (tocActionMsg) { tocActionMsg.remove(); tocActionMsg = null; }

        appendTocMsg('user', prompt);
        const statusMsg = appendTocMsg('ai', '');
        statusMsg.setAttribute('aria-busy', 'true');
        statusMsg.textContent = 'AI 生成中...';
        aiTocMessages.scrollTop = aiTocMessages.scrollHeight;

        try {
            const data = await apiJSON('/api/ai/toc', {
                method: 'POST',
                body: JSON.stringify({ book_id: bookId, prompt, messages: tocChatHistory }),
            });
            pendingTOC = data.chapters;

            statusMsg.removeAttribute('aria-busy');
            statusMsg.textContent = `已生成新目录（${data.chapters.length} 章，${countLeaves(data.chapters)} 节）`;

            tocChatHistory.push({ role: 'user', content: prompt });
            tocChatHistory.push({ role: 'assistant', content: JSON.stringify(data.chapters) });

            renderTocDiff(currentTocChapters, data.chapters);
            autoFitSidebar();
            appendTocActions();
        } catch (e) {
            statusMsg.removeAttribute('aria-busy');
            statusMsg.textContent = '生成失败：' + e.message;
            statusMsg.style.color = 'var(--pico-del-color)';
        }
        aiTocGenerate.disabled = false;
    });

    aiTocPrompt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            aiTocGenerate.click();
        }
    });

    // AI Content Panel
    const aiContentToggle = document.getElementById('aiContentToggle');
    const aiContentPanel = document.getElementById('aiContentPanel');
    const aiContentClose = document.getElementById('aiContentClose');
    const aiContentPrompt = document.getElementById('aiContentPrompt');
    const aiContentGenerate = document.getElementById('aiContentGenerate');
    const aiContentMessages = document.getElementById('aiContentMessages');

    let contentChatHistory = [];
    let pendingContent = null;
    let contentActionMsg = null;

    aiContentToggle.addEventListener('click', () => {
        if (!currentChapter) { alert('请先选择章节'); return; }
        aiContentPanel.classList.toggle('open');
    });
    aiContentClose.addEventListener('click', () => {
        aiContentPanel.classList.remove('open');
    });

    function appendContentMsg(role, text) {
        const div = document.createElement('div');
        div.className = 'chat-msg ' + role;
        div.textContent = text;
        aiContentMessages.appendChild(div);
        aiContentMessages.scrollTop = aiContentMessages.scrollHeight;
        return div;
    }

    function appendContentActions() {
        if (contentActionMsg) contentActionMsg.remove();
        const div = document.createElement('div');
        div.className = 'chat-msg ai';
        div.innerHTML = '<span style="font-size:0.85rem;">正文已显示变更预览</span>';
        const actions = document.createElement('div');
        actions.className = 'ai-toc-actions';
        actions.style.marginTop = '0.4rem';
        const applyBtn = document.createElement('button');
        applyBtn.textContent = '应用';
        applyBtn.addEventListener('click', applyContent);
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.className = 'outline secondary';
        cancelBtn.addEventListener('click', cancelContent);
        actions.appendChild(applyBtn);
        actions.appendChild(cancelBtn);
        div.appendChild(actions);
        aiContentMessages.appendChild(div);
        aiContentMessages.scrollTop = aiContentMessages.scrollHeight;
        contentActionMsg = div;
    }

    function renderContentDiff(oldText, newText) {
        const diffStr = Diff.createTwoFilesPatch('原始', '修改后', oldText, newText, '', '', { context: 3 });
        content.innerHTML = '';
        const diffContainer = document.createElement('div');
        content.appendChild(diffContainer);
        const diff2htmlUi = new Diff2HtmlUI(diffContainer, diffStr, {
            drawFileList: false,
            matching: 'lines',
            outputFormat: 'line-by-line',
        });
        diff2htmlUi.draw();
    }

    function restoreContentView() {
        content.innerHTML = marked.parse(originalContent);
    }

    function cancelContent() {
        if (contentActionMsg) { contentActionMsg.remove(); contentActionMsg = null; }
        pendingContent = null;
        restoreContentView();
    }

    async function applyContent() {
        if (!pendingContent) return;
        try {
            await apiJSON(`/api/books/${bookId}/chapters/${currentChapter}`, {
                method: 'PUT',
                body: JSON.stringify({ content: pendingContent }),
            });
            originalContent = pendingContent;
            pendingContent = null;
            contentChatHistory = [];
            aiContentMessages.innerHTML = '';
            contentActionMsg = null;
            restoreContentView();
        } catch (e) {
            alert('保存失败：' + e.message);
        }
    }

    aiContentGenerate.addEventListener('click', async () => {
        const prompt = aiContentPrompt.value.trim();
        if (!prompt || !currentChapter) return;
        aiContentPrompt.value = '';
        aiContentGenerate.disabled = true;
        if (contentActionMsg) { contentActionMsg.remove(); contentActionMsg = null; }

        appendContentMsg('user', prompt);
        const statusMsg = appendContentMsg('ai', '');
        statusMsg.setAttribute('aria-busy', 'true');
        statusMsg.textContent = 'AI 生成中...';
        aiContentMessages.scrollTop = aiContentMessages.scrollHeight;
        let fullText = '';

        try {
            await apiSSE('/api/ai/generate', {
                prompt: prompt,
                context: originalContent,
                book_id: bookId,
                chapter_id: currentChapter,
                messages: contentChatHistory,
            }, (chunk) => {
                fullText += chunk;
            }, () => {
                contentChatHistory.push({ role: 'user', content: prompt });
                contentChatHistory.push({ role: 'assistant', content: fullText });
                pendingContent = fullText;

                statusMsg.removeAttribute('aria-busy');
                statusMsg.textContent = `已生成新内容（${fullText.length} 字）`;
                renderContentDiff(originalContent, pendingContent);
                appendContentActions();
            });
        } catch (e) {
            statusMsg.removeAttribute('aria-busy');
            statusMsg.textContent = '生成失败：' + e.message;
            statusMsg.style.color = 'var(--pico-del-color)';
        }
        aiContentGenerate.disabled = false;
    });

    aiContentPrompt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            aiContentGenerate.click();
        }
    });

    loadTOC();
})();
