// Тарифы и оплата: карточки тарифов, QR/карта, поллинг статуса платежа.
import * as api from './api.js?v=2.0.0';
import { tr } from './locale.js?v=2.0.0';
import { showToast } from './app.js?v=2.0.0';
import { openAuthModal } from './auth.js?v=2.0.0';

let lang = 'ru';
let pollTimer = null;

export function initBilling(currentLang) {
    lang = currentLang;
    render();
    window.addEventListener('bpm-auth-changed', render);
}

export function updateLanguage(newLang) {
    lang = newLang;
    render();
}

// Вызывается при каждом открытии вкладки: статус подписки и счётчики
// использования должны быть свежими, а не с момента загрузки страницы.
export function refreshBilling() {
    render();
}

function t(ru, kk, en) {
    return tr(lang, ru, kk, en);
}

async function render() {
    const view = document.getElementById('view-billing');
    if (!view) return;

    view.innerHTML = `
        <div class="view-title-container">
            <h2>${t('Тарифы и оплата', 'Тарифтер және төлем', 'Plans & Billing')}</h2>
            <p>${t('Подписка расширяет лимиты ИИ-ассистента и генерации документов. Оплата — Kaspi QR или картой.',
                'Жазылым AI-көмекші мен құжат генерациясының лимиттерін кеңейтеді. Төлем — Kaspi QR немесе картамен.',
                'Subscription extends AI assistant and document generation limits. Pay via Kaspi QR or card.')}</p>
        </div>
        <div id="billing-current" style="margin-bottom:20px;"></div>
        <div class="kpi-row" id="billing-plans"></div>
        <div id="billing-history" style="margin-top:24px;"></div>
    `;

    let plans;
    try {
        plans = await api.getPlans();
    } catch (e) {
        view.querySelector('#billing-plans').innerHTML =
            `<div class="card" style="grid-column:1/-1; color:var(--danger);">${e.message}</div>`;
        return;
    }

    let subscription = null;
    if (api.isLoggedIn()) {
        try { subscription = await api.getSubscription(); } catch (e) { /* показываем тарифы без статуса */ }
    }

    renderCurrent(subscription);
    renderPlans(plans, subscription);
    renderHistory();
}

function renderCurrent(subscription) {
    const box = document.getElementById('billing-current');
    if (!box) return;
    if (!api.isLoggedIn()) {
        box.innerHTML = `
            <div class="card" style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                <span style="font-size:0.9rem;">${t('Войдите, чтобы управлять подпиской', 'Жазылымды басқару үшін кіріңіз', 'Sign in to manage your subscription')}</span>
                <button class="btn btn-primary" id="billing-login-btn">${t('Войти', 'Кіру', 'Sign in')}</button>
            </div>`;
        box.querySelector('#billing-login-btn').addEventListener('click', () => openAuthModal('login'));
        return;
    }
    if (!subscription) { box.innerHTML = ''; return; }

    const usage = subscription.usage || { ai_requests: 0, docs: 0 };
    const until = subscription.current_period_end
        ? new Date(subscription.current_period_end).toLocaleDateString()
        : '—';
    box.innerHTML = `
        <div class="card" style="display:flex; flex-wrap:wrap; align-items:center; gap:20px; font-size:0.85rem;">
            <div><strong>${t('Текущий тариф', 'Ағымдағы тариф', 'Current plan')}:</strong> ${subscription.plan.toUpperCase()}</div>
            <div>${t('Оплачен до', 'Төленген мерзім', 'Paid until')}: ${until}</div>
            <div>${t('ИИ-запросов за месяц', 'Айдағы AI-сұраныстар', 'AI requests this month')}: ${usage.ai_requests}</div>
            <div>${t('Документов за месяц', 'Айдағы құжаттар', 'Documents this month')}: ${usage.docs}</div>
            ${subscription.plan !== 'free' && !subscription.cancel_at_period_end
                ? `<button class="btn btn-secondary" id="billing-cancel-btn" style="margin-left:auto; font-size:0.75rem;">${t('Отменить продление', 'Ұзартуды тоқтату', 'Cancel renewal')}</button>`
                : ''}
        </div>`;
    const cancelBtn = box.querySelector('#billing-cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
            try {
                await api.cancelSubscription();
                showToast(t('Продление отменено: доступ сохранится до конца оплаченного периода', 'Ұзарту тоқтатылды', 'Renewal cancelled'), 'info');
                render();
            } catch (e) { showToast(e.message, 'danger'); }
        });
    }
}

function renderPlans(plans, subscription) {
    const grid = document.getElementById('billing-plans');
    if (!grid) return;
    const currentPlan = subscription ? subscription.plan : 'free';

    grid.innerHTML = plans.map((plan) => {
        const name = lang === 'kk' ? plan.name_kk : plan.name_ru;
        const price = plan.is_enterprise
            ? t('по запросу', 'сұраныс бойынша', 'on request')
            : plan.price_kzt === 0
                ? t('0 ₸', '0 ₸', '0 ₸')
                : `${plan.price_kzt.toLocaleString('ru-RU')} ₸/${t('мес', 'ай', 'mo')}`;
        const limit = (v, unit) => (v === null ? t('без лимита', 'шектеусіз', 'unlimited') : `${v} ${unit}`);
        const isCurrent = plan.key === currentPlan;

        let action = '';
        if (plan.is_enterprise) {
            action = `<a class="btn btn-secondary" style="width:100%;" href="mailto:sales@bpm-platform.kz?subject=Enterprise">${t('Связаться', 'Байланысу', 'Contact us')}</a>`;
        } else if (isCurrent) {
            action = `<button class="btn btn-secondary" style="width:100%;" disabled>${t('Текущий тариф', 'Ағымдағы тариф', 'Current plan')}</button>`;
        } else if (plan.key === 'pro') {
            action = `<button class="btn btn-primary billing-subscribe-btn" data-plan="${plan.key}" style="width:100%;">${t('Подключить', 'Қосу', 'Subscribe')}</button>`;
        } else {
            action = `<div style="font-size:0.75rem; color:var(--text-muted); text-align:center;">${t('Действует по умолчанию', 'Әдепкі бойынша', 'Default plan')}</div>`;
        }

        return `
            <div class="card" style="display:flex; flex-direction:column; gap:10px; ${isCurrent ? 'outline:2px solid var(--primary);' : ''}">
                <div style="font-weight:700;">${name}</div>
                <div style="font-size:1.4rem; font-weight:700; color:var(--primary);">${price}</div>
                <ul style="font-size:0.8rem; color:var(--text-muted); line-height:1.8; list-style:none;">
                    <li>• ${t('ИИ-ассистент', 'AI-көмекші', 'AI assistant')}: ${limit(plan.ai_requests_per_month, t('запросов/мес', 'сұраныс/ай', 'req/mo'))}</li>
                    <li>• ${t('Документы (DOCX/PDF)', 'Құжаттар (DOCX/PDF)', 'Documents (DOCX/PDF)')}: ${limit(plan.docs_per_month, t('в месяц', 'айына', 'per month'))}</li>
                    <li>• ${t('Процессы и матрица', 'Процестер мен матрица', 'Processes & matrix')}: ${t('без лимита', 'шектеусіз', 'unlimited')}</li>
                    ${plan.is_enterprise ? `<li>• On-premise, SLA, ${t('изоляция данных', 'деректерді оқшаулау', 'data isolation')}</li>` : ''}
                </ul>
                <div style="margin-top:auto;">${action}</div>
            </div>`;
    }).join('');

    grid.querySelectorAll('.billing-subscribe-btn').forEach((btn) =>
        btn.addEventListener('click', () => startPayment(btn.dataset.plan))
    );
}

async function renderHistory() {
    const box = document.getElementById('billing-history');
    if (!box || !api.isLoggedIn()) return;
    let payments;
    try { payments = await api.getPayments(); } catch (e) { return; }
    if (!payments.length) return;

    box.innerHTML = `
        <div class="card">
            <h3 style="font-size:1rem; font-weight:600; margin-bottom:12px;">${t('История платежей', 'Төлемдер тарихы', 'Payment history')}</h3>
            <div class="matrix-table-container">
                <table class="matrix-table">
                    <thead><tr>
                        <th>№</th><th>${t('Дата', 'Күні', 'Date')}</th><th>${t('Тариф', 'Тариф', 'Plan')}</th>
                        <th>${t('Сумма', 'Сома', 'Amount')}</th><th>${t('Способ', 'Тәсіл', 'Method')}</th><th>${t('Статус', 'Мәртебе', 'Status')}</th>
                    </tr></thead>
                    <tbody>
                        ${payments.map((p) => `
                            <tr>
                                <td>${p.id}</td>
                                <td>${new Date(p.created_at).toLocaleString()}</td>
                                <td>${p.plan}</td>
                                <td>${p.amount_kzt.toLocaleString('ru-RU')} ₸</td>
                                <td>${p.method === 'card' ? `${p.card_brand} •${p.card_last4}` : 'QR'}</td>
                                <td><span class="task-badge ${p.status === 'success' ? 'completed' : p.status === 'pending' ? 'warning' : 'danger'}">${p.status}</span></td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
}

// ---------- Оплата ----------

async function startPayment(plan) {
    if (!api.isLoggedIn()) {
        openAuthModal('login');
        return;
    }
    let payment;
    try {
        payment = await api.subscribe(plan);
    } catch (e) {
        showToast(e.message, 'danger');
        return;
    }
    openPaymentModal(payment);
}

function openPaymentModal(payment) {
    closePaymentModal();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'modal-payment';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width:420px;">
            <div class="modal-header">
                <span>${t('Оплата подписки', 'Жазылымды төлеу', 'Subscription payment')} — ${payment.amount_kzt.toLocaleString('ru-RU')} ₸</span>
                <button class="modal-close" id="payment-close">&times;</button>
            </div>
            <div class="modal-body">
                <div style="display:flex; gap:8px; margin-bottom:14px;">
                    <button class="btn btn-primary" id="pay-tab-qr" style="flex:1;">Kaspi QR</button>
                    <button class="btn btn-secondary" id="pay-tab-card" style="flex:1;">${t('Картой', 'Картамен', 'By card')}</button>
                </div>
                <div id="pay-body-qr">
                    <div style="text-align:center; padding:8px;">
                        <div id="pay-qr-box" style="background:#fff; color:#000; border-radius:12px; padding:18px; font-family:monospace; font-size:0.7rem; word-break:break-all;">
                            ${payment.qr_token ? escapeHtml(payment.qr_token) : t('QR недоступен', 'QR қолжетімсіз', 'QR unavailable')}
                        </div>
                        ${payment.payment_link ? `<a class="btn btn-secondary" style="margin-top:10px;" href="${payment.payment_link}" target="_blank" rel="noopener">${t('Открыть в Kaspi', 'Kaspi-де ашу', 'Open in Kaspi')}</a>` : ''}
                        <div id="pay-status" style="margin-top:14px; font-size:0.85rem; color:var(--text-muted);">
                            ${t('Ожидание оплаты…', 'Төлем күтілуде…', 'Waiting for payment…')}
                        </div>
                    </div>
                </div>
                <div id="pay-body-card" style="display:none;">
                    <div class="form-group"><label>${t('Номер карты', 'Карта нөірі', 'Card number')}</label>
                        <input class="form-control" id="card-number" inputmode="numeric" placeholder="4400 4300 0000 0000" maxlength="23"></div>
                    <div class="form-group"><label>${t('Владелец', 'Иесі', 'Holder')}</label>
                        <input class="form-control" id="card-holder" placeholder="ASSEL NURLANOVA"></div>
                    <div style="display:flex; gap:8px;">
                        <div class="form-group" style="flex:1;"><label>${t('Месяц/Год', 'Ай/Жыл', 'MM/YYYY')}</label>
                            <input class="form-control" id="card-exp" placeholder="12/2028" maxlength="7"></div>
                        <div class="form-group" style="flex:1;"><label>CVV</label>
                            <input class="form-control" id="card-cvv" type="password" inputmode="numeric" maxlength="4" placeholder="123"></div>
                    </div>
                    <div id="card-error" style="display:none; color:var(--danger); font-size:0.8rem; margin-bottom:8px;"></div>
                    <button class="btn btn-primary" id="card-pay-btn" style="width:100%;">${t('Оплатить', 'Төлеу', 'Pay')} ${payment.amount_kzt.toLocaleString('ru-RU')} ₸</button>
                    <div style="font-size:0.68rem; color:var(--text-muted); margin-top:8px;">
                        ${t('Реквизиты карты передаются платёжному провайдеру и не сохраняются на сервере.',
                            'Карта деректері төлем провайдеріне беріледі және серверде сақталмайды.',
                            'Card details are passed to the payment provider and are not stored on the server.')}
                    </div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#payment-close').addEventListener('click', closePaymentModal);
    overlay.querySelector('#pay-tab-qr').addEventListener('click', () => switchPayTab(true));
    overlay.querySelector('#pay-tab-card').addEventListener('click', () => switchPayTab(false));
    overlay.querySelector('#card-pay-btn').addEventListener('click', () => payByCard(payment.id));

    pollPayment(payment.id);
}

function switchPayTab(qr) {
    const modal = document.getElementById('modal-payment');
    if (!modal) return;
    modal.querySelector('#pay-body-qr').style.display = qr ? '' : 'none';
    modal.querySelector('#pay-body-card').style.display = qr ? 'none' : '';
    modal.querySelector('#pay-tab-qr').className = qr ? 'btn btn-primary' : 'btn btn-secondary';
    modal.querySelector('#pay-tab-card').className = qr ? 'btn btn-secondary' : 'btn btn-primary';
}

function pollPayment(paymentId) {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
        let payment;
        try { payment = await api.getPayment(paymentId); } catch (e) { return; }
        if (payment.status === 'success') {
            clearInterval(pollTimer);
            paymentSucceeded();
        } else if (payment.status === 'failed' || payment.status === 'expired') {
            clearInterval(pollTimer);
            const el = document.getElementById('pay-status');
            if (el) el.innerHTML = `<span style="color:var(--danger);">${t('Платёж не прошёл', 'Төлем өтпеді', 'Payment failed')}</span>`;
        }
    }, 3000);
}

async function payByCard(paymentId) {
    const value = (id) => document.getElementById(id).value.trim();
    const exp = value('card-exp').split('/');
    const errorBox = document.getElementById('card-error');
    errorBox.style.display = 'none';
    const btn = document.getElementById('card-pay-btn');
    btn.disabled = true;
    try {
        await api.payWithCard(paymentId, {
            card_number: value('card-number').replace(/\s+/g, ''),
            holder: value('card-holder'),
            exp_month: parseInt(exp[0], 10) || 0,
            exp_year: parseInt(exp[1], 10) || 0,
            cvv: value('card-cvv'),
        });
        clearInterval(pollTimer);
        paymentSucceeded();
    } catch (e) {
        errorBox.textContent = e.message;
        errorBox.style.display = 'block';
    } finally {
        btn.disabled = false;
    }
}

function paymentSucceeded() {
    closePaymentModal();
    showToast(t('Оплата прошла! Тариф активирован.', 'Төлем сәтті өтті! Тариф іске қосылды.', 'Payment successful! Plan activated.'), 'success');
    render();
}

function closePaymentModal() {
    clearInterval(pollTimer);
    const modal = document.getElementById('modal-payment');
    if (modal) modal.remove();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
