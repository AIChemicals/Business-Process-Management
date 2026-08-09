// Клиент API бэкенда: авторизация (JWT в localStorage), синхронизация
// workspace, биллинг, ИИ, скачивание документов.
import db from './data.js?v=2.0.0';

const BASE = window.BPM_API_BASE || 'http://localhost:8000';

export function getToken() {
    return localStorage.getItem('bpm_jwt') || '';
}

export function setToken(token) {
    if (token) localStorage.setItem('bpm_jwt', token);
    else localStorage.removeItem('bpm_jwt');
}

export function getUser() {
    try {
        return JSON.parse(localStorage.getItem('bpm_user')) || null;
    } catch (e) {
        return null;
    }
}

export function setUser(user) {
    if (user) localStorage.setItem('bpm_user', JSON.stringify(user));
    else localStorage.removeItem('bpm_user');
}

export function isLoggedIn() {
    return Boolean(getToken());
}

export class ApiError extends Error {
    constructor(status, detail) {
        super(detail);
        this.status = status;
    }
}

async function request(method, path, body, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let response;
    try {
        response = await fetch(BASE + path, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch (e) {
        throw new ApiError(0, 'Сервер недоступен. Проверьте, запущен ли бэкенд.');
    }

    if (response.status === 401 && !opts.keepSession) {
        // Токен истёк или отозван — выходим из аккаунта, локальные данные остаются
        setToken('');
        setUser(null);
        window.dispatchEvent(new CustomEvent('bpm-auth-changed'));
    }

    if (opts.blob) {
        if (!response.ok) {
            let detail = `Ошибка ${response.status}`;
            try { detail = (await response.json()).detail || detail; } catch (e) { /* не JSON */ }
            throw new ApiError(response.status, detail);
        }
        return response.blob();
    }

    let data = null;
    try { data = await response.json(); } catch (e) { /* пустое тело */ }
    if (!response.ok) {
        throw new ApiError(response.status, (data && data.detail) || `Ошибка ${response.status}`);
    }
    return data;
}

// ---------- Auth ----------

export async function register(email, password, fullName) {
    const data = await request('POST', '/api/auth/register', { email, password, full_name: fullName });
    setToken(data.access_token);
    setUser(data.user);
    return data;
}

export async function login(email, password) {
    const data = await request('POST', '/api/auth/login', { email, password });
    setToken(data.access_token);
    setUser(data.user);
    return data;
}

export function logout() {
    setToken('');
    setUser(null);
    window.dispatchEvent(new CustomEvent('bpm-auth-changed'));
}

export async function refreshMe() {
    const user = await request('GET', '/api/auth/me');
    setUser(user);
    return user;
}

export const verifyEmail = (token) => request('POST', '/api/auth/verify-email', { token });
export const resendVerification = () => request('POST', '/api/auth/resend-verification');
export const forgotPassword = (email) => request('POST', '/api/auth/forgot-password', { email });
export const resetPassword = (token, newPassword) =>
    request('POST', '/api/auth/reset-password', { token, new_password: newPassword });

// ---------- Workspace sync ----------

function workspaceSnapshot() {
    return {
        departments: db.departments,
        roles: db.roles,
        templates: db.templates,
        matrix: db.matrix,
        matrixVersions: db.matrixVersions,
        instances: db.instances,
        tasks: db.tasks,
        systemTime: db.systemTime,
        timeSpeed: db.timeSpeed,
    };
}

export function applyWorkspace(data) {
    if (!data) return;
    db.departments = data.departments || db.departments;
    db.roles = data.roles || db.roles;
    db.templates = data.templates || db.templates;
    db.matrix = data.matrix || db.matrix;
    db.matrixVersions = data.matrixVersions || db.matrixVersions;
    db.instances = data.instances || db.instances;
    db.tasks = data.tasks || db.tasks;
    if (data.systemTime) db.systemTime = data.systemTime;
    if (data.timeSpeed) db.timeSpeed = data.timeSpeed;
    db.save();
}

let syncTimer = null;
let syncState = 'idle'; // idle | pending | error

export function getSyncState() {
    return syncState;
}

function setSyncState(state) {
    syncState = state;
    window.dispatchEvent(new CustomEvent('bpm-sync-state', { detail: state }));
}

// Отложенная отправка: частые правки (drag узлов, тик часов) склеиваются в один PUT.
export function scheduleWorkspaceSync() {
    if (!isLoggedIn()) return;
    clearTimeout(syncTimer);
    setSyncState('pending');
    syncTimer = setTimeout(async () => {
        try {
            await request('PUT', '/api/workspace', { data: workspaceSnapshot() });
            setSyncState('idle');
        } catch (e) {
            setSyncState('error');
        }
    }, 1500);
}

export async function pullWorkspace() {
    return request('GET', '/api/workspace');
}

export async function pushWorkspaceNow() {
    await request('PUT', '/api/workspace', { data: workspaceSnapshot() });
    setSyncState('idle');
}

// После входа: если на сервере есть данные — берём их, иначе отправляем локальные.
export async function syncAfterLogin() {
    const server = await pullWorkspace();
    if (server && server.data && Array.isArray(server.data.roles) && server.data.roles.length) {
        applyWorkspace(server.data);
        return 'pulled';
    }
    await pushWorkspaceNow();
    return 'pushed';
}

// ---------- Billing ----------

export const getPlans = () => request('GET', '/api/billing/plans');
export const getSubscription = () => request('GET', '/api/billing/subscription');
export const subscribe = (plan) => request('POST', '/api/billing/subscribe', { plan });
export const getPayment = (id) => request('GET', `/api/billing/payments/${id}`);
export const getPayments = () => request('GET', '/api/billing/payments');
export const payWithCard = (id, card) => request('POST', `/api/billing/payments/${id}/card`, card);
export const cancelSubscription = () => request('POST', '/api/billing/cancel');

// ---------- AI ----------

export const aiChat = (message, history, lang) => request('POST', '/api/ai/chat', { message, history, lang });
export const aiGenerateProcess = (description, lang) =>
    request('POST', '/api/ai/generate-process', { description, lang });

// ---------- Documents ----------

async function downloadBlob(path, body, filename) {
    const blob = await request('POST', path, body, { blob: true });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadRegulation(templateId, format, lang) {
    return downloadBlob(
        '/api/docs/regulation',
        { template_id: templateId, format, lang, workspace: workspaceSnapshot() },
        `reglament.${format}`
    );
}

export function downloadMatrixReport(format, lang) {
    return downloadBlob(
        '/api/docs/matrix-report',
        { format, lang, workspace: workspaceSnapshot() },
        `matrix_report.${format}`
    );
}
