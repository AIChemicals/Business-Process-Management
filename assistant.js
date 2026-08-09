// ИИ-ассистент: чат по процессам (с опорой на официальные источники)
// и генерация BPMN-шаблона процесса из текстового описания.
import * as api from './api.js?v=2.0.0';
import db from './data.js?v=2.0.0';
import { tr } from './locale.js?v=2.0.0';
import { showToast } from './app.js?v=2.0.0';
import { openAuthModal } from './auth.js?v=2.0.0';

let lang = 'ru';
let history = []; // [{role, content}]

export function initAssistant(currentLang) {
    lang = currentLang;
    render();
}

export function updateLanguage(newLang) {
    lang = newLang;
    render();
}

function t(ru, kk, en) {
    return tr(lang, ru, kk, en);
}

function render() {
    const view = document.getElementById('view-assistant');
    if (!view) return;

    view.innerHTML = `
        <div class="view-title-container">
            <h2>${t('ИИ-ассистент по процессам', 'Процестер бойынша AI-көмекші', 'AI Process Assistant')}</h2>
            <p>${t(
                'Вопросы по BPMN, ролям, SLA и нормативке РК — ответы со ссылками на официальные источники (adilet.zan.kz). Генерация шаблона процесса из описания.',
                'BPMN, рөлдер, SLA және ҚР нормативтік базасы бойынша сұрақтар — ресми дереккөздерге (adilet.zan.kz) сілтемелермен. Сипаттамадан процесс шаблонын генерациялау.',
                'Questions on BPMN, roles, SLA and Kazakhstan regulations — answers cite official sources (adilet.zan.kz). Generate a process template from a description.'
            )}</p>
        </div>

        <div class="split-layout">
            <div class="split-left">
                <div class="card" style="display:flex; flex-direction:column; height:calc(100vh - 240px); min-height:420px;">
                    <div id="ai-chat-log" style="flex-grow:1; overflow-y:auto; display:flex; flex-direction:column; gap:12px; padding-right:6px;"></div>
                    <div style="display:flex; gap:8px; margin-top:12px;">
                        <textarea class="form-control" id="ai-chat-input" rows="2" style="resize:none;"
                            placeholder="${t('Например: какие SLA поставить на правовую экспертизу договора?', 'Мысалы: шарттың құқықтық сараптамасына қандай SLA қою керек?', 'E.g.: what SLA should legal review of a contract have?')}"></textarea>
                        <button class="btn btn-primary" id="ai-chat-send" style="align-self:flex-end;">
                            ${t('Отправить', 'Жіберу', 'Send')}
                        </button>
                    </div>
                </div>
            </div>
            <div class="split-right">
                <div class="card">
                    <h3 style="font-size:1rem; font-weight:600; margin-bottom:12px;">
                        ${t('Сгенерировать процесс', 'Процесті генерациялау', 'Generate a process')}
                    </h3>
                    <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:10px;">
                        ${t('Опишите процесс словами — ИИ построит BPMN-шаблон с ролями, SLA и условиями, и он появится в конструкторе.',
                            'Процесті сөзбен сипаттаңыз — AI рөлдері, SLA және шарттары бар BPMN-шаблон құрады, ол конструкторда пайда болады.',
                            'Describe the process in words — AI builds a BPMN template with roles, SLA and conditions; it appears in the modeler.')}
                    </p>
                    <textarea class="form-control" id="ai-gen-input" rows="6"
                        placeholder="${t('Например: процесс командировки — сотрудник подаёт заявку, руководитель согласует, если сумма больше 500 000 тенге — утверждает директор, бухгалтерия оплачивает…',
                            'Мысалы: іссапар процесі — қызметкер өтінім береді, басшы келіседі, сома 500 000 теңгеден асса — директор бекітеді…',
                            'E.g.: business trip process — employee files a request, manager approves, if amount exceeds 500,000 KZT the director approves…')}"></textarea>
                    <button class="btn btn-primary" id="ai-gen-btn" style="width:100%; margin-top:10px;">
                        ${t('Построить BPMN-шаблон', 'BPMN-шаблон құру', 'Build BPMN template')}
                    </button>
                </div>
                <div class="card" style="margin-top:16px;">
                    <h3 style="font-size:1rem; font-weight:600; margin-bottom:10px;">
                        ${t('Официальные источники', 'Ресми дереккөздер', 'Official sources')}
                    </h3>
                    <ul style="font-size:0.75rem; color:var(--text-muted); line-height:1.7; padding-left:16px;">
                        <li><a href="https://adilet.zan.kz/" target="_blank" rel="noopener">adilet.zan.kz</a> — ${t('эталонный банк НПА РК', 'ҚР НҚА эталондық банкі', 'official legal acts of Kazakhstan')}</li>
                        <li><a href="https://adilet.zan.kz/rus/docs/Z1300000094" target="_blank" rel="noopener">${t('Закон «О персональных данных»', '«Дербес деректер туралы» заң', 'Personal Data Law')}</a></li>
                        <li><a href="https://adilet.zan.kz/rus/docs/K1500000414" target="_blank" rel="noopener">${t('Трудовой кодекс РК', 'ҚР Еңбек кодексі', 'Labor Code of Kazakhstan')}</a></li>
                        <li><a href="https://www.omg.org/spec/BPMN/2.0/" target="_blank" rel="noopener">BPMN 2.0 (OMG / ISO 19510)</a></li>
                    </ul>
                </div>
            </div>
        </div>
    `;

    renderLog();

    view.querySelector('#ai-chat-send').addEventListener('click', sendChat);
    view.querySelector('#ai-chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChat();
        }
    });
    view.querySelector('#ai-gen-btn').addEventListener('click', generateProcess);
}

function renderLog() {
    const log = document.getElementById('ai-chat-log');
    if (!log) return;

    if (history.length === 0) {
        log.innerHTML = `
            <div style="margin:auto; text-align:center; color:var(--text-muted); font-size:0.85rem; max-width:360px;">
                ${t('Задайте вопрос о процессах, ролевой матрице или нормативных требованиях — ассистент видит ваши процессы и отвечает по делу.',
                    'Процестер, рөлдік матрица немесе нормативтік талаптар туралы сұрақ қойыңыз — көмекші сіздің процестеріңізді көреді.',
                    'Ask about processes, the role matrix or regulatory requirements — the assistant sees your processes.')}
            </div>`;
        return;
    }

    log.innerHTML = history.map((m) => {
        const isUser = m.role === 'user';
        return `
            <div style="align-self:${isUser ? 'flex-end' : 'flex-start'}; max-width:85%;
                        background:${isUser ? 'var(--primary)' : 'rgba(128,128,128,0.12)'};
                        color:${isUser ? '#fff' : 'var(--text-main)'};
                        border-radius:12px; padding:10px 14px; font-size:0.85rem; line-height:1.5; white-space:pre-wrap; word-break:break-word;">${formatMessage(m.content)}</div>
        `;
    }).join('');
    log.scrollTop = log.scrollHeight;
}

function formatMessage(text) {
    const div = document.createElement('div');
    div.textContent = text;
    let html = div.innerHTML;
    // Кликабельные ссылки на источники
    html = html.replace(/(https?:\/\/[^\s)<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:inherit; text-decoration:underline;">$1</a>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return html;
}

function requireLogin() {
    if (!api.isLoggedIn()) {
        showToast(t('Войдите в аккаунт, чтобы пользоваться ИИ-ассистентом', 'AI-көмекшіні пайдалану үшін аккаунтқа кіріңіз', 'Sign in to use the AI assistant'), 'warning');
        openAuthModal('login');
        return false;
    }
    return true;
}

async function sendChat() {
    const input = document.getElementById('ai-chat-input');
    const message = input.value.trim();
    if (!message || !requireLogin()) return;

    input.value = '';
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: '…' });
    renderLog();

    try {
        const past = history.slice(0, -2).slice(-10);
        const res = await api.aiChat(message, past, lang);
        history[history.length - 1] = { role: 'assistant', content: res.answer };
    } catch (e) {
        history.pop();
        showToast(e.message, 'danger');
    }
    renderLog();
}

async function generateProcess() {
    const input = document.getElementById('ai-gen-input');
    const description = input.value.trim();
    if (description.length < 10) {
        showToast(t('Опишите процесс подробнее (минимум пара предложений)', 'Процесті толығырақ сипаттаңыз', 'Describe the process in more detail'), 'warning');
        return;
    }
    if (!requireLogin()) return;

    const btn = document.getElementById('ai-gen-btn');
    btn.disabled = true;
    btn.textContent = t('Генерация…', 'Генерациялануда…', 'Generating…');

    try {
        const res = await api.aiGenerateProcess(description, lang);
        db.templates.push(res.template);
        db.save();
        // Немедленный PUT вместо отложенного: следом идёт reload, который
        // убил бы debounce-таймер, и шаблон не доехал бы до сервера.
        try { await api.pushWorkspaceNow(); } catch (e) { /* синхронизируется позже */ }
        window.dispatchEvent(new CustomEvent('db-updated'));
        showToast(t('Шаблон создан! Открываю конструктор…', 'Шаблон құрылды! Конструктор ашылуда…', 'Template created! Opening the modeler…'), 'success');
        // Открываем конструктор с новым шаблоном
        location.hash = 'modeler';
        setTimeout(() => location.reload(), 600);
    } catch (e) {
        showToast(e.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.textContent = t('Построить BPMN-шаблон', 'BPMN-шаблон құру', 'Build BPMN template');
    }
}
