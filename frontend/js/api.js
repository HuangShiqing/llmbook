const API_BASE = '';
const TOKEN_KEY = 'ebook_token';
const USER_KEY = 'ebook_user';

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function setAuth(token, username) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
}

function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

function getUsername() {
    return localStorage.getItem(USER_KEY);
}

function requireAuth() {
    if (!getToken()) {
        window.location.href = '/login.html';
        return false;
    }
    return true;
}

async function api(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 401) {
        clearAuth();
        window.location.href = '/login.html';
        throw new Error('未登录');
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '请求失败' }));
        throw new Error(err.detail || '请求失败');
    }
    return res;
}

async function apiJSON(path, options = {}) {
    const res = await api(path, options);
    return res.json();
}

async function apiSSE(path, body, onChunk, onDone) {
    const token = getToken();
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '请求失败' }));
        throw new Error(err.detail || '请求失败');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') {
                if (onDone) onDone();
                return;
            }
            try {
                const parsed = JSON.parse(data);
                if (parsed.error) throw new Error(parsed.error);
                if (parsed.content) onChunk(parsed.content);
            } catch (e) {
                if (e.message !== 'Unexpected end of JSON input') console.error(e);
            }
        }
    }
    if (onDone) onDone();
}

function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}
