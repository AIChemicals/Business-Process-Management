import { pickName, tr as i18n } from './locale.js?v=1.1.0';
import db from './data.js?v=1.1.0';
import translations from './locale.js?v=1.1.0';
import { initMatrix, updateLanguage as updateMatrixLang, renderMatrix } from './matrix.js?v=1.1.0';
import { initModeler, updateLanguage as updateModelerLang } from './modeler.js?v=1.1.0';
import { initEngine, updateLanguage as updateEngineLang, updateUserRole, renderTasks, startProcessDirectly } from './engine.js?v=1.1.0';
import { initAnalytics, updateLanguage as updateAnalyticsLang } from './analytics.js?v=1.1.0';
import { initAdmin, updateLanguage as updateAdminLang } from './admin.js?v=1.1.0';
import { setDialogsLanguage } from './dialogs.js?v=1.1.0';

let currentLanguage = 'ru';
let activeUserRoleId = 'role_initiator';
let activeView = 'matrix';

// DOM Elements cache
let navItems, viewContainers, headerTitle, userRoleSelect, btnRu, btnKk, btnEn, themeToggleBtn, notifBell, notifDrawer, notifClearBtn, notifListContainer, toastContainer;

window.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    setupGlobalListeners();
    loadSession();
    
    setDialogsLanguage(currentLanguage);
    
    // Boot Modules
    translateDOM();
    populateUserRoleSelect();
    
    initMatrix(currentLanguage);
    initModeler(currentLanguage);
    initEngine(currentLanguage, activeUserRoleId);
    initAnalytics(currentLanguage);
    initAdmin(currentLanguage);

    renderExternalPortal();

    applyDeepLink();
});

// Deep-linking: open a specific tab / language / theme via URL,
// e.g. index.html?lang=en&theme=light#analytics
function applyDeepLink() {
    const params = new URLSearchParams(location.search);

    const qLang = params.get('lang');
    if (qLang && ['ru', 'kk', 'en'].includes(qLang) && qLang !== currentLanguage) {
        changeLanguage(qLang);
    }

    const qTheme = params.get('theme');
    if (qTheme === 'light' || qTheme === 'dark') {
        applyTheme(qTheme);
    }

    const qRole = params.get('role');
    if (qRole && db.roles.find(r => r.id === qRole)) {
        activeUserRoleId = qRole;
        userRoleSelect.value = qRole;
        localStorage.setItem('bpm_active_role', qRole);
        updateUserRole(qRole);
        renderExternalPortal();
    }

    const viewId = (location.hash || '').replace('#', '');
    const validViews = ['matrix', 'modeler', 'tasks', 'external', 'analytics', 'admin'];
    if (validViews.includes(viewId)) {
        navItems.forEach(i => i.classList.toggle('active', i.dataset.view === viewId));
        switchView(viewId);
    }
}

function cacheElements() {
    navItems = document.querySelectorAll('.nav-item');
    viewContainers = document.querySelectorAll('.view-container');
    headerTitle = document.getElementById('header-view-title');
    userRoleSelect = document.getElementById('user-role-select');
    btnRu = document.getElementById('lang-ru');
    btnKk = document.getElementById('lang-kk');
    btnEn = document.getElementById('lang-en');
    themeToggleBtn = document.getElementById('theme-toggle-btn');

    notifBell = document.getElementById('notif-bell-btn');
    notifDrawer = document.getElementById('notif-drawer');
    notifClearBtn = document.getElementById('notif-clear-btn');
    notifListContainer = document.getElementById('notif-list-container');
    
    toastContainer = document.getElementById('toast-container');
}

function setupGlobalListeners() {
    // Navigation routing
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            navItems.forEach(i => i.classList.remove('active'));
            const clicked = e.currentTarget;
            clicked.classList.add('active');
            
            const view = clicked.dataset.view;
            switchView(view);
        });
    });

    // Language Toggle
    btnRu.addEventListener('click', () => changeLanguage('ru'));
    btnKk.addEventListener('click', () => changeLanguage('kk'));
    btnEn.addEventListener('click', () => changeLanguage('en'));

    // Theme Toggle (dark / light)
    themeToggleBtn.addEventListener('click', toggleTheme);

    // Simulation User switch
    userRoleSelect.addEventListener('change', (e) => {
        activeUserRoleId = e.target.value;
        localStorage.setItem('bpm_active_role', activeUserRoleId);
        
        updateUserRole(activeUserRoleId);
        renderExternalPortal();
        
        showToast(i18n(currentLanguage, 'Вы переключили роль симулятора', 'Сіз симулятор рөлін ауыстырдыңыз', 'You switched the simulator role'), 'info');
    });

    // Notifications toggle panel
    notifBell.addEventListener('click', (e) => {
        e.stopPropagation();
        notifDrawer.classList.toggle('active');
        notifBell.classList.remove('unread');
    });

    document.addEventListener('click', () => {
        notifDrawer.classList.remove('active');
    });

    notifDrawer.addEventListener('click', (e) => e.stopPropagation());
    notifClearBtn.addEventListener('click', clearNotifications);

    // Toast Custom listener hook
    window.addEventListener('show-toast', (e) => {
        showToast(e.detail.message, e.detail.type);
    });

    // Refresh database references on update
    window.addEventListener('db-updated', () => {
        populateUserRoleSelect();
        renderMatrix();
        renderExternalPortal();
        renderTasks();
    });

    // Modeler run shortcut listener
    window.addEventListener('trigger-simulate-process', (e) => {
        const templateId = e.detail.templateId;
        switchView('tasks');
        
        // Find tasks active link in side nav
        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.view === 'tasks') {
                item.classList.add('active');
            }
        });

        startProcessDirectly(templateId);
    });

    // Periodic notifications list refresh listener
    window.addEventListener('notifications-updated', renderNotificationsList);
}

function loadSession() {
    currentLanguage = localStorage.getItem('bpm_lang') || 'ru';
    activeUserRoleId = localStorage.getItem('bpm_active_role') || 'role_initiator';

    setActiveLangButton(currentLanguage);
    applyTheme(localStorage.getItem('bpm_theme') || 'dark');
}

function setActiveLangButton(lang) {
    [btnRu, btnKk, btnEn].forEach(btn => btn && btn.classList.remove('active'));
    const map = { ru: btnRu, kk: btnKk, en: btnEn };
    if (map[lang]) map[lang].classList.add('active');
}

function applyTheme(theme) {
    const isLight = theme === 'light';
    document.body.classList.toggle('light-theme', isLight);
    localStorage.setItem('bpm_theme', isLight ? 'light' : 'dark');
    if (themeToggleBtn) {
        themeToggleBtn.classList.toggle('active', isLight);
        themeToggleBtn.title = isLight ? 'Светлая тема' : 'Тёмная тема';
    }
}

function toggleTheme() {
    const next = document.body.classList.contains('light-theme') ? 'dark' : 'light';
    applyTheme(next);
}

function switchView(viewId) {
    activeView = viewId;
    viewContainers.forEach(container => {
        container.classList.remove('active');
        if (container.id === `view-${viewId}`) {
            container.classList.add('active');
        }
    });

    // Header Title translation key update
    const navKeyMap = {
        matrix: 'matrixTitle',
        modeler: 'modelerTitle',
        tasks: 'tasksTitle',
        external: 'externalTitle',
        analytics: 'analyticsTitle',
        admin: 'adminTitle'
    };

    headerTitle.dataset.localize = navKeyMap[viewId] || '';
    
    // Refresh targeted views data on load
    if (viewId === 'matrix') {
        renderMatrix();
    } else if (viewId === 'external') {
        renderExternalPortal();
    } else if (viewId === 'tasks') {
        renderTasks();
    }

    translateDOM();
}

function changeLanguage(lang) {
    if (currentLanguage === lang) return;
    currentLanguage = lang;
    localStorage.setItem('bpm_lang', lang);
    setDialogsLanguage(lang);

    setActiveLangButton(lang);

    // Translate DOM nodes and views
    translateDOM();
    populateUserRoleSelect();
    
    updateMatrixLang(lang);
    updateModelerLang(lang);
    updateEngineLang(lang);
    updateAnalyticsLang(lang);
    updateAdminLang(lang);

    renderExternalPortal();
}

function translateDOM() {
    const dict = translations[currentLanguage];
    if (!dict) return;

    // Direct text contents translation
    document.querySelectorAll('[data-localize]').forEach(el => {
        const key = el.dataset.localize;
        if (dict[key]) {
            el.textContent = dict[key];
        }
    });

    // Placeholder inputs translations
    document.querySelectorAll('[data-placeholder]').forEach(el => {
        const key = el.dataset.placeholder;
        if (dict[key]) {
            el.setAttribute('placeholder', dict[key]);
        }
    });
}

function populateUserRoleSelect() {
    if (!userRoleSelect) return;
    const prev = userRoleSelect.value || activeUserRoleId;
    userRoleSelect.innerHTML = '';
    
    db.roles.forEach(role => {
        const name = pickName(role, currentLanguage);
        userRoleSelect.innerHTML += `<option value="${role.id}">${name}</option>`;
    });

    if (db.roles.find(r => r.id === prev)) {
        userRoleSelect.value = prev;
        activeUserRoleId = prev;
    } else {
        userRoleSelect.value = 'role_initiator';
        activeUserRoleId = 'role_initiator';
    }
}

// TOAST NOTIFICATIONS POPUPS
export function showToast(message, type = 'info') {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `card`;
    toast.style.padding = '12px 18px';
    toast.style.fontSize = '0.85rem';
    toast.style.borderLeft = '4px solid';
    toast.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.4)';
    toast.style.transform = 'translateY(20px)';
    toast.style.opacity = '0';
    toast.style.transition = 'all 0.3s ease';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '10px';
    
    let color = 'var(--primary)';
    if (type === 'success') color = 'var(--success)';
    if (type === 'warning') color = 'var(--warning)';
    if (type === 'danger') color = 'var(--danger)';

    toast.style.borderLeftColor = color;
    
    // Dynamic icon choice
    let icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`;
    if (type === 'success') {
        icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>`;
    } else if (type === 'danger' || type === 'warning') {
        icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    }

    toast.innerHTML = `
        ${icon}
        <span style="flex-grow: 1;">${message}</span>
    `;

    toastContainer.appendChild(toast);
    
    // Trigger transition
    setTimeout(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
    }, 10);

    // Self-destruct after 4 seconds
    setTimeout(() => {
        toast.style.transform = 'translateY(-20px)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// DRAWER NOTIFICATIONS
function renderNotificationsList() {
    if (!notifListContainer) return;
    notifListContainer.innerHTML = '';
    
    const logs = window.bpmSystemNotifications || [];
    if (logs.length === 0) {
        notifListContainer.innerHTML = `
            <div style="padding: 32px; text-align: center; color: var(--text-muted); font-size: 0.8rem; font-style: italic;">
                ${i18n(currentLanguage, 'Уведомлений нет', 'Хабарламалар жоқ', 'No notifications')}
            </div>
        `;
        return;
    }

    logs.forEach(log => {
        const item = document.createElement('div');
        item.className = 'notif-item';
        item.style.cursor = 'pointer';
        
        let severityClass = 'info';
        let icon = 'i';
        if (log.severity === 'warning') { severityClass = 'warning'; icon = '!'; }
        if (log.severity === 'danger') { severityClass = 'danger'; icon = '×'; }

        item.innerHTML = `
            <div class="notif-icon ${severityClass}">${icon}</div>
            <div class="notif-content" style="flex-grow: 1;">
                <div style="font-weight: 500;">${log.message}</div>
                <div class="notif-time">${log.time}</div>
            </div>
        `;

        // Click to redirect
        item.addEventListener('click', () => {
            if (log.taskId && log.roleId) {
                // 1. Switch the simulator user role
                activeUserRoleId = log.roleId;
                userRoleSelect.value = log.roleId;
                localStorage.setItem('bpm_active_role', log.roleId);
                updateUserRole(log.roleId);

                // 2. Select the tasks tab
                switchView('tasks');
                
                // Update navigation visual state
                navItems.forEach(nav => {
                    nav.classList.remove('active');
                    if (nav.dataset.view === 'tasks') {
                        nav.classList.add('active');
                    }
                });

                // 3. Close drawer
                notifDrawer.classList.remove('active');

                // 4. Smooth scroll and highlight the target task card
                setTimeout(() => {
                    const cardEl = document.querySelector(`[data-task-id="${log.taskId}"]`);
                    if (cardEl) {
                        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        cardEl.style.outline = '2px solid var(--primary)';
                        cardEl.style.boxShadow = '0 0 20px rgba(99, 102, 241, 0.4)';
                        setTimeout(() => {
                            cardEl.style.outline = '';
                            cardEl.style.boxShadow = '';
                        }, 2500);
                    }
                }, 150);
            }
        });

        notifListContainer.appendChild(item);
    });
}

function clearNotifications() {
    window.bpmSystemNotifications = [];
    renderNotificationsList();
    notifBell.classList.remove('unread');
}

// EXTERNAL PORTAL RENDER LOGIC
function renderExternalPortal() {
    const tableBody = document.getElementById('external-portal-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    // External tasks are those mapped to role_external_vendor
    const externalTasks = db.tasks.filter(t => t.roleId === 'role_external_vendor');
    
    if (externalTasks.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); font-style: italic; padding: 24px;">
                    ${i18n(currentLanguage, 'Запросов во внешние организации нет', 'Сыртқы ұйымдарға сұраныстар жоқ', 'No requests to external organizations')}
                </td>
            </tr>
        `;
        return;
    }

    externalTasks.forEach(task => {
        const instance = db.instances.find(i => i.id === task.instanceId);
        const processName = instance ? instance.name : 'Unknown Process';
        
        // Status classes and labels
        let statusBadge = '';
        let actionBtn = '';

        if (task.status === 'active') {
            statusBadge = `<span class="task-badge warning" data-localize="externalStatusSent">${i18n(currentLanguage, 'Запрос отправлен', 'Сұраныс жіберілді', 'Request sent')}</span>`;
            
            // Allow simulating a response from vendor
            actionBtn = `
                <button class="btn btn-primary btn-sim-external-respond" data-id="${task.id}" style="padding: 4px 8px; font-size: 0.75rem;">
                    ${i18n(currentLanguage, 'Симулировать ответ', 'Жауапты симуляциялау', 'Simulate response')}
                </button>
            `;
        } else {
            statusBadge = `<span class="task-badge completed" data-localize="externalStatusApproved">${i18n(currentLanguage, 'Исполнено', 'Орындалды', 'Completed')}</span>`;
            actionBtn = `<span style="color:var(--text-muted); font-size:0.75rem;">${i18n(currentLanguage, 'Ответ предоставлен', 'Жауап берілді', 'Response provided')}</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600;">${processName}</td>
            <td>${pickName(task, currentLanguage)}</td>
            <td>${i18n(currentLanguage, 'Инициатор блока', 'Блок бастамашысы', 'Unit initiator')}</td>
            <td>${i18n(currentLanguage, 'АО "КазПочта" / Поставщик', '"ҚазПошта" АҚ / Жеткізуші', 'Kazpost JSC / Supplier')}</td>
            <td>${statusBadge}</td>
            <td>${actionBtn}</td>
        `;

        if (task.status === 'active') {
            tr.querySelector('.btn-sim-external-respond').addEventListener('click', () => {
                simulateExternalResponse(task.id);
            });
        }

        tableBody.appendChild(tr);
    });
}

function simulateExternalResponse(taskId) {
    const taskIndex = db.tasks.findIndex(t => t.id === taskId);
    if (taskIndex < 0) return;
    const task = db.tasks[taskIndex];

    // Complete external step
    task.status = 'completed';
    task.completedAt = db.systemTime;

    const instance = db.instances.find(i => i.id === task.instanceId);
    if (!instance) return;

    instance.auditTrail.push({
        nodeId: task.nodeId,
        action: 'external_response_received',
        userId: 'role_external_vendor',
        timestamp: db.systemTime
    });

    // Advance to next step
    const template = db.templates.find(t => t.id === instance.templateId);
    if (template) {
        const connections = template.connections.filter(c => c.from === task.nodeId);
        connections.forEach(conn => {
            const nextNode = template.nodes.find(n => n.id === conn.to);
            if (nextNode) {
                instance.currentNodeId = nextNode.id;
                // Import dynamic execution step loader
                // Since this runs inside app.js context, let's call engine to spawn tasks
                // To keep app.js decoupled, we just spawn task helper directly here
                spawnTaskForExternalAdvance(instance, nextNode);
            }
        });
    }

    db.save();
    renderExternalPortal();
    renderTasks();
    
    showToast(i18n(currentLanguage, 'Ответ от внешней организации получен! Процесс продвинулся дальше.', 'Сыртқы ұйымнан жауап алынды! Процесс әрі қарай жылжыды.', 'Response received from the external organization! The process moved forward.'), 'success');
}

function spawnTaskForExternalAdvance(instance, node) {
    const sysDate = new Date(db.systemTime);
    const slaHours = node.sla || 24;
    sysDate.setHours(sysDate.getHours() + slaHours);

    const newTask = {
        id: `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        instanceId: instance.id,
        nodeId: node.id,
        nameRu: node.nameRu,
        nameKk: node.nameKk,
        roleId: node.roleId || 'role_initiator',
        status: 'active',
        createdAt: db.systemTime,
        dueDate: sysDate.toISOString(),
        comments: [],
        documents: []
    };

    db.tasks.push(newTask);
}
