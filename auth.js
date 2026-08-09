// Экран входа/регистрации/восстановления пароля + карточка аккаунта в сайдбаре.
// Вся разметка собирается здесь, чтобы index.html не распухал.
import * as api from './api.js?v=2.0.0';
import { tr } from './locale.js?v=2.0.0';
import { showToast } from './app.js?v=2.0.0';

let lang = 'ru';

export function initAuth(currentLang) {
    lang = currentLang;
    renderAccountBox();
    buildModal();

    window.addEventListener('bpm-auth-changed', () => {
        renderAccountBox();
    });

    // Индикатор синхронизации в карточке аккаунта
    window.addEventListener('bpm-sync-state', renderAccountBox);

    handleDeepLinks();
}

export function updateLanguage(newLang) {
    lang = newLang;
    renderAccountBox();
    const modal = document.getElementById('modal-auth');
    if (modal && modal.classList.contains('active')) {
        renderAuthForm(modal.dataset.mode || 'login');
    }
}

// Токены из писем: ?verify_token=... и ?reset_token=...
async function handleDeepLinks() {
    const params = new URLSearchParams(location.search);

    const verifyToken = params.get('verify_token');
    if (verifyToken) {
        stripQueryParam('verify_token');
        try {
            await api.verifyEmail(verifyToken);
            if (api.isLoggedIn()) await api.refreshMe();
            showToast(tr(lang, 'Почта подтверждена!', 'Пошта расталды!', 'Email verified!'), 'success');
            renderAccountBox();
        } catch (e) {
            showToast(e.message, 'danger');
        }
    }

    const resetToken = params.get('reset_token');
    if (resetToken) {
        stripQueryParam('reset_token');
        openAuthModal('reset', { token: resetToken });
    }
}

function stripQueryParam(name) {
    const url = new URL(location.href);
    url.searchParams.delete(name);
    history.replaceState({}, '', url);
}

// ---------- Карточка аккаунта в сайдбаре ----------

function renderAccountBox() {
    const box = document.getElementById('account-box');
    if (!box) return;
    const user = api.getUser();

    if (!user || !api.isLoggedIn()) {
        box.innerHTML = `
            <button class="btn btn-primary" id="account-login-btn" style="width:100%;">
                ${tr(lang, 'Войти / Регистрация', 'Кіру / Тіркелу', 'Sign in / Register')}
            </button>
            <div style="font-size:0.7rem; color:var(--text-muted); margin-top:6px; text-align:center;">
                ${tr(lang, 'Данные хранятся локально', 'Деректер жергілікті сақталады', 'Data is stored locally')}
            </div>
        `;
        box.querySelector('#account-login-btn').addEventListener('click', () => openAuthModal('login'));
        return;
    }

    const sync = api.getSyncState();
    const syncLabel = sync === 'error'
        ? `<span style="color:var(--danger);">${tr(lang, 'ошибка синхронизации', 'синхрондау қатесі', 'sync error')}</span>`
        : sync === 'pending'
            ? tr(lang, 'синхронизация…', 'синхрондалуда…', 'syncing…')
            : tr(lang, 'синхронизировано с сервером', 'сервермен синхрондалды', 'synced with server');

    const verifiedBadge = user.email_verified
        ? `<span style="color:var(--success);" title="${tr(lang, 'Почта подтверждена', 'Пошта расталды', 'Email verified')}">✓</span>`
        : `<a href="#" id="account-verify-link" style="color:var(--warning); font-size:0.7rem;">${tr(lang, 'подтвердить почту', 'поштаны растау', 'verify email')}</a>`;

    box.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
            <div style="min-width:0;">
                <div style="font-size:0.78rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${escapeHtml(user.email)} ${verifiedBadge}
                </div>
                <div style="font-size:0.68rem; color:var(--text-muted);">${syncLabel}</div>
            </div>
            <button class="btn btn-secondary" id="account-logout-btn" style="padding:4px 8px; font-size:0.7rem;">
                ${tr(lang, 'Выйти', 'Шығу', 'Log out')}
            </button>
        </div>
    `;

    box.querySelector('#account-logout-btn').addEventListener('click', () => {
        api.logout();
        showToast(tr(lang, 'Вы вышли из аккаунта. Данные остались в этом браузере.', 'Аккаунттан шықтыңыз. Деректер осы браузерде қалды.', 'Signed out. Data remains in this browser.'), 'info');
    });

    const verifyLink = box.querySelector('#account-verify-link');
    if (verifyLink) {
        verifyLink.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const res = await api.resendVerification();
                if (res.email_debug_link) {
                    // SMTP не настроен: показываем ссылку прямо здесь (демо-режим)
                    window.open(res.email_debug_link, '_self');
                } else {
                    showToast(tr(lang, 'Письмо отправлено — проверьте почту', 'Хат жіберілді — поштаңызды тексеріңіз', 'Email sent — check your inbox'), 'success');
                }
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ---------- Модал входа ----------

function buildModal() {
    if (document.getElementById('modal-auth')) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-auth';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width:400px;">
            <div class="modal-header">
                <span id="auth-modal-title"></span>
                <button class="modal-close" id="auth-modal-close">&times;</button>
            </div>
            <div class="modal-body" id="auth-modal-body"></div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#auth-modal-close').addEventListener('click', closeAuthModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeAuthModal();
    });
}

export function openAuthModal(mode = 'login', extra = {}) {
    buildModal();
    const modal = document.getElementById('modal-auth');
    modal.dataset.mode = mode;
    modal.dataset.resetToken = extra.token || '';
    modal.classList.add('active');
    renderAuthForm(mode);
}

function closeAuthModal() {
    const modal = document.getElementById('modal-auth');
    if (modal) modal.classList.remove('active');
}

function renderAuthForm(mode) {
    const modal = document.getElementById('modal-auth');
    const title = modal.querySelector('#auth-modal-title');
    const body = modal.querySelector('#auth-modal-body');
    modal.dataset.mode = mode;

    const t = (ru, kk, en) => tr(lang, ru, kk, en);
    const field = (id, type, label, placeholder = '') => `
        <div class="form-group">
            <label for="${id}">${label}</label>
            <input type="${type}" class="form-control" id="${id}" placeholder="${placeholder}" autocomplete="${type === 'password' ? 'current-password' : 'email'}">
        </div>
    `;
    const errorBox = `<div id="auth-error" style="display:none; color:var(--danger); font-size:0.8rem; margin-bottom:10px;"></div>`;

    if (mode === 'login') {
        title.textContent = t('Вход в аккаунт', 'Аккаунтқа кіру', 'Sign in');
        body.innerHTML = `
            ${errorBox}
            ${field('auth-email', 'email', 'Email', 'you@company.kz')}
            ${field('auth-password', 'password', t('Пароль', 'Құпиясөз', 'Password'))}
            <button class="btn btn-primary" id="auth-submit" style="width:100%;">${t('Войти', 'Кіру', 'Sign in')}</button>
            <div style="display:flex; justify-content:space-between; margin-top:12px; font-size:0.8rem;">
                <a href="#" id="auth-to-register">${t('Регистрация', 'Тіркелу', 'Register')}</a>
                <a href="#" id="auth-to-forgot">${t('Забыли пароль?', 'Құпиясөзді ұмыттыңыз ба?', 'Forgot password?')}</a>
            </div>
        `;
    } else if (mode === 'register') {
        title.textContent = t('Регистрация', 'Тіркелу', 'Registration');
        body.innerHTML = `
            ${errorBox}
            ${field('auth-name', 'text', t('Имя и фамилия', 'Аты-жөні', 'Full name'), t('Асель Нурланова', 'Әсел Нұрланова', 'John Smith'))}
            ${field('auth-email', 'email', 'Email', 'you@company.kz')}
            ${field('auth-password', 'password', t('Пароль (мин. 8 символов)', 'Құпиясөз (кем дегенде 8 таңба)', 'Password (min 8 chars)'))}
            <button class="btn btn-primary" id="auth-submit" style="width:100%;">${t('Создать аккаунт', 'Аккаунт құру', 'Create account')}</button>
            <div style="margin-top:12px; font-size:0.8rem; text-align:center;">
                <a href="#" id="auth-to-login">${t('Уже есть аккаунт? Войти', 'Аккаунт бар ма? Кіру', 'Have an account? Sign in')}</a>
            </div>
        `;
    } else if (mode === 'forgot') {
        title.textContent = t('Восстановление пароля', 'Құпиясөзді қалпына келтіру', 'Password recovery');
        body.innerHTML = `
            ${errorBox}
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">
                ${t('Укажите email — пришлём ссылку для смены пароля.', 'Email енгізіңіз — құпиясөзді өзгерту сілтемесін жібереміз.', 'Enter your email — we will send a reset link.')}
            </p>
            ${field('auth-email', 'email', 'Email', 'you@company.kz')}
            <button class="btn btn-primary" id="auth-submit" style="width:100%;">${t('Отправить ссылку', 'Сілтеме жіберу', 'Send link')}</button>
            <div style="margin-top:12px; font-size:0.8rem; text-align:center;">
                <a href="#" id="auth-to-login">${t('Назад ко входу', 'Кіруге оралу', 'Back to sign in')}</a>
            </div>
        `;
    } else { // reset
        title.textContent = t('Новый пароль', 'Жаңа құпиясөз', 'New password');
        body.innerHTML = `
            ${errorBox}
            ${field('auth-password', 'password', t('Новый пароль (мин. 8 символов)', 'Жаңа құпиясөз (кем дегенде 8 таңба)', 'New password (min 8 chars)'))}
            <button class="btn btn-primary" id="auth-submit" style="width:100%;">${t('Сохранить пароль', 'Құпиясөзді сақтау', 'Save password')}</button>
        `;
    }

    const wire = (id, nextMode) => {
        const el = body.querySelector(id);
        if (el) el.addEventListener('click', (e) => { e.preventDefault(); renderAuthForm(nextMode); });
    };
    wire('#auth-to-register', 'register');
    wire('#auth-to-login', 'login');
    wire('#auth-to-forgot', 'forgot');

    body.querySelector('#auth-submit').addEventListener('click', () => submit(mode));
    body.querySelectorAll('input').forEach((input) =>
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(mode); })
    );
}

function showError(message) {
    const el = document.getElementById('auth-error');
    if (el) {
        el.textContent = message;
        el.style.display = 'block';
    }
}

async function submit(mode) {
    const modal = document.getElementById('modal-auth');
    const value = (id) => (document.getElementById(id) ? document.getElementById(id).value.trim() : '');
    const submitBtn = modal.querySelector('#auth-submit');
    submitBtn.disabled = true;

    try {
        if (mode === 'login') {
            await api.login(value('auth-email'), document.getElementById('auth-password').value);
            await afterAuth();
        } else if (mode === 'register') {
            const res = await api.register(value('auth-email'), document.getElementById('auth-password').value, value('auth-name'));
            await afterAuth();
            if (res.email_debug_link) {
                showToast(tr(lang, 'SMTP не настроен: ссылка подтверждения открыта в этой вкладке', 'SMTP бапталмаған: растау сілтемесі осы қойындыда ашылды', 'SMTP not configured: verification link opened in this tab'), 'warning');
                window.open(res.email_debug_link, '_self');
            } else {
                showToast(tr(lang, 'Мы отправили письмо для подтверждения почты', 'Поштаны растау үшін хат жібердік', 'We sent a verification email'), 'info');
            }
        } else if (mode === 'forgot') {
            const res = await api.forgotPassword(value('auth-email'));
            if (res.email_debug_link) {
                window.open(res.email_debug_link, '_self');
            } else {
                showToast(tr(lang, 'Если адрес зарегистрирован — письмо уже в пути', 'Егер адрес тіркелген болса — хат жолда', 'If the address is registered, the email is on its way'), 'success');
                closeAuthModal();
            }
        } else if (mode === 'reset') {
            await api.resetPassword(modal.dataset.resetToken, document.getElementById('auth-password').value);
            showToast(tr(lang, 'Пароль изменён — войдите с новым паролем', 'Құпиясөз өзгертілді — жаңасымен кіріңіз', 'Password changed — sign in with the new one'), 'success');
            renderAuthForm('login');
        }
    } catch (e) {
        showError(e.message);
    } finally {
        submitBtn.disabled = false;
    }
}

async function afterAuth() {
    closeAuthModal();
    renderAccountBox();
    window.dispatchEvent(new CustomEvent('bpm-auth-changed'));
    try {
        const result = await api.syncAfterLogin();
        if (result === 'pulled') {
            showToast(tr(lang, 'Данные загружены с сервера', 'Деректер серверден жүктелді', 'Data loaded from server'), 'success');
            // Все модули читают db при рендере — перезагрузка проще и надёжнее
            setTimeout(() => location.reload(), 800);
        } else {
            showToast(tr(lang, 'Локальные данные сохранены на сервере', 'Жергілікті деректер серверге сақталды', 'Local data saved to server'), 'success');
        }
    } catch (e) {
        showToast(tr(lang, 'Вход выполнен, но синхронизация не удалась: ', 'Кіру сәтті, бірақ синхрондау сәтсіз: ', 'Signed in, but sync failed: ') + e.message, 'warning');
    }
}
