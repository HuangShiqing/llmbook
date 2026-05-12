(function () {
    if (!requireAuth()) return;

    const bookId = getParam('book') || 'my-first-book';
    const chapterId = getParam('chapter');
    if (!chapterId) {
        window.location.href = '/';
        return;
    }

    const pageTitle = document.getElementById('pageTitle');
    const editor = document.getElementById('editor');
    const saveBtn = document.getElementById('saveBtn');
    const previewBtn = document.getElementById('previewBtn');
    const previewModal = document.getElementById('previewModal');
    const previewArea = document.getElementById('previewArea');
    const closePreview = document.getElementById('closePreview');
    const backBtn = document.getElementById('backBtn');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatSend = document.getElementById('chatSend');

    const tabEditor = document.getElementById('tabEditor');
    const tabAI = document.getElementById('tabAI');
    const editorPanel = document.getElementById('editorPanel');
    const aiPanel = document.getElementById('aiPanel');

    backBtn.href = `/?book=${bookId}&chapter=${chapterId}`;
    pageTitle.textContent = `编辑：${chapterId}`;

    // Load chapter
    async function loadContent() {
        const toc = await apiJSON(`/api/books/${bookId}/toc`);
        const ch = toc.chapters.find(c => c.id === chapterId);
        if (ch) pageTitle.textContent = `编辑：${ch.title}`;

        const data = await apiJSON(`/api/books/${bookId}/chapters/${chapterId}`);
        editor.value = data.content;
    }

    // Save
    saveBtn.addEventListener('click', async () => {
        saveBtn.setAttribute('aria-busy', 'true');
        try {
            await apiJSON(`/api/books/${bookId}/chapters/${chapterId}`, {
                method: 'PUT',
                body: JSON.stringify({ content: editor.value }),
            });
            saveBtn.textContent = '已保存';
            setTimeout(() => { saveBtn.textContent = '保存'; }, 1500);
        } catch (e) {
            alert('保存失败：' + e.message);
        }
        saveBtn.removeAttribute('aria-busy');
    });

    // Preview
    previewBtn.addEventListener('click', () => {
        previewArea.innerHTML = marked.parse(editor.value);
        previewModal.classList.add('open');
    });
    closePreview.addEventListener('click', () => previewModal.classList.remove('open'));
    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) previewModal.classList.remove('open');
    });

    // Mobile tabs
    tabEditor.addEventListener('click', () => {
        editorPanel.classList.remove('hidden-mobile');
        aiPanel.classList.add('hidden-mobile');
    });
    tabAI.addEventListener('click', () => {
        aiPanel.classList.remove('hidden-mobile');
        editorPanel.classList.add('hidden-mobile');
    });

    // AI Chat
    let chatHistory = [];

    function addMessage(role, text) {
        const div = document.createElement('div');
        div.className = `chat-msg ${role}`;
        div.innerHTML = role === 'ai' ? marked.parse(text) : text;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return div;
    }

    let generating = false;
    async function sendChat() {
        const prompt = chatInput.value.trim();
        if (!prompt || generating) return;
        generating = true;
        chatInput.value = '';
        chatSend.setAttribute('aria-busy', 'true');

        addMessage('user', prompt);
        const aiMsg = addMessage('ai', '');
        let fullText = '';

        try {
            await apiSSE('/api/ai/generate', {
                prompt: prompt,
                context: editor.value,
                book_id: bookId,
                chapter_id: chapterId,
                messages: chatHistory,
            }, (chunk) => {
                fullText += chunk;
                aiMsg.innerHTML = marked.parse(fullText);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }, () => {
                chatHistory.push({ role: 'user', content: prompt });
                chatHistory.push({ role: 'assistant', content: fullText });
                // Add "apply" button
                const applyBtn = document.createElement('button');
                applyBtn.textContent = '应用到编辑器';
                applyBtn.className = 'outline';
                applyBtn.style.cssText = 'font-size:0.8rem; padding:0.2rem 0.6rem; margin-top:0.5rem;';
                applyBtn.addEventListener('click', () => {
                    editor.value = fullText;
                    applyBtn.textContent = '已应用';
                    applyBtn.disabled = true;
                });
                aiMsg.appendChild(applyBtn);
            });
        } catch (e) {
            aiMsg.textContent = '错误：' + e.message;
        }

        chatSend.removeAttribute('aria-busy');
        generating = false;
    }

    chatSend.addEventListener('click', sendChat);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChat();
        }
    });

    loadContent();
})();
