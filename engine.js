import { pickName, tr as i18n } from './locale.js?v=2.0.0';
import db from './data.js?v=2.0.0';
import { customAlert } from './dialogs.js?v=2.0.0';

let currentLanguage = 'ru';
let activeUserRoleId = 'role_initiator';
let simulationInterval = null;

// DOM Elements cache
let activeTasksContainer, completedTasksContainer, btnTasksActive, btnTasksCompleted, newInstanceBtn;
let modalNewInst, modalNewInstClose, modalNewInstCancel, modalNewInstStart, modalInstTemplate, modalInstName, modalInstBudget;

export function initEngine(lang, userRoleId) {
    currentLanguage = lang;
    activeUserRoleId = userRoleId;
    
    cacheElements();
    setupListeners();
    renderTasks();
    startSimulationClock();
}

export function updateLanguage(lang) {
    currentLanguage = lang;
    renderTasks();
}

export function updateUserRole(roleId) {
    activeUserRoleId = roleId;
    renderTasks();
}

function cacheElements() {
    activeTasksContainer = document.getElementById('tasks-active-container');
    completedTasksContainer = document.getElementById('tasks-completed-container');
    btnTasksActive = document.getElementById('tab-tasks-active');
    btnTasksCompleted = document.getElementById('tab-tasks-completed');
    newInstanceBtn = document.getElementById('tasks-new-instance-btn');

    // Launch Process Modal
    modalNewInst = document.getElementById('modal-new-instance');
    modalNewInstClose = document.getElementById('modal-new-instance-close');
    modalNewInstCancel = document.getElementById('modal-new-instance-cancel');
    modalNewInstStart = document.getElementById('modal-new-instance-start');
    modalInstTemplate = document.getElementById('modal-inst-template');
    modalInstName = document.getElementById('modal-inst-name');
    modalInstBudget = document.getElementById('modal-inst-budget');
}

function setupListeners() {
    // Tab switching
    btnTasksActive.addEventListener('click', () => {
        btnTasksActive.className = 'btn btn-primary';
        btnTasksCompleted.className = 'btn btn-secondary';
        activeTasksContainer.style.display = 'grid';
        completedTasksContainer.style.display = 'none';
        renderTasks();
    });

    btnTasksCompleted.addEventListener('click', () => {
        btnTasksActive.className = 'btn btn-secondary';
        btnTasksCompleted.className = 'btn btn-primary';
        activeTasksContainer.style.display = 'none';
        completedTasksContainer.style.display = 'grid';
        renderTasks();
    });

    // New Instance Modal Actions
    newInstanceBtn.addEventListener('click', openLaunchModal);
    [modalNewInstClose, modalNewInstCancel].forEach(el => el.addEventListener('click', () => modalNewInst.classList.remove('active')));
    modalNewInstStart.addEventListener('click', startNewProcessInstance);
}

function openLaunchModal() {
    // Populate templates dropdown
    modalInstTemplate.innerHTML = '';
    db.templates.forEach(t => {
        const name = pickName(t, currentLanguage);
        modalInstTemplate.innerHTML += `<option value="${t.id}">${name}</option>`;
    });

    // Default instance name
    modalInstName.value = '';
    modalInstBudget.value = 1500000;
    modalNewInst.classList.add('active');
}

function startNewProcessInstance() {
    const templateId = modalInstTemplate.value;
    const template = db.templates.find(t => t.id === templateId);
    if (!template) return;

    let instName = modalInstName.value.trim();
    if (instName === '') {
        const baseName = pickName(template, currentLanguage);
        instName = `${baseName} (№${Math.floor(Math.random() * 900) + 100})`;
    }

    const budget = parseFloat(modalInstBudget.value) || 0;
    const instanceId = `inst_${Date.now()}`;
    
    // Find starting task node connected from Start Event
    const startConn = template.connections.find(c => c.from === 'node_start');
    if (!startConn) {
        customAlert(i18n(currentLanguage, 'Ошибка: шаблон не содержит соединения от Старт ноды', 'Қате: үлгіде Бастау торабынан байланыс жоқ', 'Error: template has no connection from the Start node'));
        return;
    }

    const firstNodeId = startConn.to;
    const firstNode = template.nodes.find(n => n.id === firstNodeId);
    if (!firstNode) return;

    // Create process instance
    const newInstance = {
        id: instanceId,
        templateId,
        name: instName,
        status: 'active',
        currentNodeId: firstNodeId,
        startedAt: db.systemTime,
        variables: { budget },
        auditTrail: [
            { nodeId: 'node_start', action: 'start', userId: activeUserRoleId, timestamp: db.systemTime }
        ]
    };

    db.instances.push(newInstance);

    // Spawn first task
    spawnTaskForNode(newInstance, firstNode);

    db.save();
    modalNewInst.classList.remove('active');
    renderTasks();

    // Trigger visual toast
    const event = new CustomEvent('show-toast', {
        detail: {
            message: i18n(currentLanguage, `Запущен процесс '${instName}'`, `'${instName}' процесі іске қосылды`, `Process '${instName}' launched`),
            type: 'success'
        }
    });
    window.dispatchEvent(event);
}

export function startProcessDirectly(templateId) {
    // Helper to start from modeler page shortcut
    openLaunchModal();
    modalInstTemplate.value = templateId;
}

function spawnTaskForNode(instance, node) {
    // Calculate SLA due date
    const sysDate = new Date(db.systemTime);
    const slaHours = node.sla || 24;
    sysDate.setHours(sysDate.getHours() + slaHours);

    const task = {
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

    db.tasks.push(task);

    const processName = instance.name;
    const alertMsg = i18n(currentLanguage,
        `Вам назначена задача: '${node.nameRu}' в процессе '${processName}'`,
        `Сізге тапсырма тағайындалды: '${processName}' процесіндегі '${node.nameKk}'`,
        `You have been assigned a task: '${pickName(node, 'en')}' in process '${processName}'`);
    
    // Log to notifications database list
    logNotification(alertMsg, 'info', node.nameRu, task.id, task.roleId);

    // Dispatch system-wide alert for new task if it matches the current role
    if (task.roleId === activeUserRoleId) {
        const event = new CustomEvent('show-toast', {
            detail: { message: alertMsg, type: 'info' }
        });
        window.dispatchEvent(event);
    }
}

export function renderTasks() {
    if (!activeTasksContainer) return;

    activeTasksContainer.innerHTML = '';
    completedTasksContainer.innerHTML = '';

    // Filter tasks based on current role selector
    const activeTasks = db.tasks.filter(t => t.status === 'active' && t.roleId === activeUserRoleId);
    const completedTasks = db.tasks.filter(t => t.status === 'completed' && t.roleId === activeUserRoleId);

    // Render Active
    if (activeTasks.length === 0) {
        activeTasksContainer.innerHTML = `
            <div class="card" style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 48px;">
                <p data-localize="tasksNoTasks">${i18n(currentLanguage, 'Нет активных задач для вашей текущей роли.', 'Ағымдағы роліңіз үшін белсенді тапсырмалар жоқ.', 'No active tasks for your current role.')}</p>
            </div>
        `;
    } else {
        activeTasks.forEach(task => {
            const card = createTaskCard(task, false);
            activeTasksContainer.appendChild(card);
        });
    }

    // Render Archived
    if (completedTasks.length === 0) {
        completedTasksContainer.innerHTML = `
            <div class="card" style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 48px;">
                <p>${i18n(currentLanguage, 'Архив пуст.', 'Мұрағат бос.', 'Archive is empty.')}</p>
            </div>
        `;
    } else {
        completedTasks.forEach(task => {
            const card = createTaskCard(task, true);
            completedTasksContainer.appendChild(card);
        });
    }
}

function createTaskCard(task, isArchive) {
    const instance = db.instances.find(i => i.id === task.instanceId);
    const processName = instance ? instance.name : 'Unknown Process';
    const taskName = pickName(task, currentLanguage);
    
    // SLA calculation
    const now = new Date(db.systemTime);
    const due = new Date(task.dueDate);
    const diffHours = (due - now) / (1000 * 60 * 60);

    let slaClass = 'active';
    let slaLabel = '';

    if (isArchive) {
        slaClass = 'completed';
        slaLabel = i18n(currentLanguage, 'Завершено', 'Аяқталды', 'Completed');
    } else {
        if (diffHours < 0) {
            slaClass = 'danger';
            slaLabel = i18n(currentLanguage, 'Просрочено', 'Мерзімі өткен', 'Overdue');
        } else if (diffHours <= 6) {
            slaClass = 'warning';
            slaLabel = i18n(currentLanguage, 'Срок истекает', 'Мерзімі таяу', 'Due soon');
        } else {
            slaClass = 'active';
            slaLabel = i18n(currentLanguage, 'В работе', 'Жұмыста', 'In progress');
        }
    }

    const card = document.createElement('div');
    card.className = `card task-card ${slaClass}`;
    card.dataset.taskId = task.id;
    
    // Header
    let actionButtonsHtml = '';
    if (!isArchive) {
        actionButtonsHtml = `
            <div style="display: flex; gap: 8px; margin-top: 12px;">
                <button class="btn btn-primary btn-approve" data-id="${task.id}" style="padding: 6px 12px; font-size: 0.8rem;">
                    ${i18n(currentLanguage, 'Выполнить', 'Орындау', 'Complete')}
                </button>
                <button class="btn btn-danger btn-reject" data-id="${task.id}" style="padding: 6px 12px; font-size: 0.8rem;">
                    ${i18n(currentLanguage, 'Отклонить', 'Қабылдамау', 'Reject')}
                </button>
            </div>
        `;
    }

    // SLA Remaining output
    const hoursLeft = Math.max(0, Math.floor(diffHours));
    const slaRemainingText = isArchive 
        ? `${i18n(currentLanguage, 'Выполнено за', 'Орындалу уақыты', 'Completed in')}` 
        : `${i18n(currentLanguage, 'Осталось времени', 'Қалған уақыт', 'Time remaining')}`;
    const slaRemainingVal = isArchive
        ? `SLA OK`
        : `${hoursLeft} ч (hours)`;

    card.innerHTML = `
        <div class="task-header">
            <div>
                <h4 style="font-weight: 700; font-size: 0.95rem; margin-bottom: 2px;">${taskName}</h4>
                <span style="font-size: 0.75rem; color: var(--primary); font-weight: 500;">${processName}</span>
            </div>
            <span class="task-badge ${slaClass}">${slaLabel}</span>
        </div>

        <div class="task-meta">
            <div class="task-meta-item">
                <span>${slaRemainingText}:</span>
                <span class="task-meta-val" style="color: ${slaClass === 'danger' ? 'var(--danger)' : 'inherit'}">${slaRemainingVal}</span>
            </div>
            <div class="task-meta-item">
                <span>${i18n(currentLanguage, 'Начало', 'Басталды', 'Started')}:</span>
                <span class="task-meta-val">${task.createdAt.replace('T', ' ').substring(0,16)}</span>
            </div>
            <div class="task-meta-item">
                <span>${i18n(currentLanguage, 'Дедлайн', 'Шектеулі мерзім', 'Deadline')}:</span>
                <span class="task-meta-val">${task.dueDate.replace('T', ' ').substring(0,16)}</span>
            </div>
        </div>

        <!-- Document attachments -->
        <div class="task-docs-section">
            <span class="task-comment-title">${i18n(currentLanguage, 'Прикрепленные файлы', 'Тіркелген файлдар', 'Attached files')}</span>
            <div class="task-docs-list">
                ${task.documents.map(doc => `
                    <div class="task-doc-item">
                        <a href="${doc.url}" class="task-doc-name">${doc.name}</a>
                        <span class="task-doc-size">${doc.size}</span>
                    </div>
                `).join('')}
            </div>
            ${!isArchive ? `
                <button class="btn btn-secondary btn-attach-doc" data-id="${task.id}" style="padding: 4px 8px; font-size: 0.7rem; width: fit-content; margin-top: 4px;">
                    + ${i18n(currentLanguage, 'Добавить документ', 'Құжат қосу', 'Add document')}
                </button>
            ` : ''}
        </div>

        <!-- Comments segment -->
        <div class="task-comments-section">
            <span class="task-comment-title">${i18n(currentLanguage, 'Обсуждение', 'Талқылау', 'Discussion')}</span>
            <div class="task-comments-list">
                ${task.comments.length === 0 ? `<span style="color: var(--text-muted); font-style:italic;">${i18n(currentLanguage, 'Комментариев нет', 'Пікірлер жоқ', 'No comments')}</span>` : ''}
                ${task.comments.map(c => `
                    <div class="task-comment-item">
                        <span class="task-comment-author">${c.user}:</span>
                        <span>${c.text}</span>
                    </div>
                `).join('')}
            </div>
            ${!isArchive ? `
                <div class="task-comment-input-box">
                    <input type="text" class="form-control comment-input-el" placeholder="${i18n(currentLanguage, 'Написать...', 'Жазу...', 'Write...')}" style="padding: 6px 8px; font-size: 0.75rem;">
                    <button class="btn btn-secondary btn-send-comment" data-id="${task.id}" style="padding: 6px 10px;">
                        ${i18n(currentLanguage, 'ОК', 'Жіберу', 'Send')}
                    </button>
                </div>
            ` : ''}
        </div>

        ${actionButtonsHtml}
    `;

    // Attach listeners dynamically
    if (!isArchive) {
        card.querySelector('.btn-approve').addEventListener('click', () => completeTask(task.id, 'approve'));
        card.querySelector('.btn-reject').addEventListener('click', () => completeTask(task.id, 'reject'));
        card.querySelector('.btn-attach-doc').addEventListener('click', () => attachDocumentMock(task.id));
        
        const commentBtn = card.querySelector('.btn-send-comment');
        const commentInput = card.querySelector('.comment-input-el');
        commentBtn.addEventListener('click', () => {
            addComment(task.id, commentInput.value);
            commentInput.value = '';
        });
        commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addComment(task.id, commentInput.value);
                commentInput.value = '';
            }
        });
    }

    return card;
}

function completeTask(taskId, resolution) {
    const taskIndex = db.tasks.findIndex(t => t.id === taskId);
    if (taskIndex < 0) return;
    const task = db.tasks[taskIndex];

    // Mark task completed
    task.status = 'completed';
    task.completedAt = db.systemTime;

    const instance = db.instances.find(i => i.id === task.instanceId);
    if (!instance) return;

    // Log in audit trail
    instance.auditTrail.push({
        nodeId: task.nodeId,
        action: resolution,
        userId: activeUserRoleId,
        timestamp: db.systemTime
    });

    const template = db.templates.find(t => t.id === instance.templateId);
    if (!template) return;

    if (resolution === 'reject') {
        // Simple return workflow: reject returns process to the initiator
        const firstNode = template.nodes.find(n => n.type === 'start');
        const startConn = template.connections.find(c => c.from === 'node_start');
        if (startConn) {
            const firstTaskNode = template.nodes.find(n => n.id === startConn.to);
            if (firstTaskNode) {
                instance.currentNodeId = firstTaskNode.id;
                spawnTaskForNode(instance, firstTaskNode);
                
                const event = new CustomEvent('show-toast', {
                    detail: {
                        message: i18n(currentLanguage,
                            `Процесс '${instance.name}' возвращен на доработку`,
                            `'${instance.name}' процесі қайта өңдеуге қайтарылды`,
                            `Process '${instance.name}' has been returned for revision`),
                        type: 'warning'
                    }
                });
                window.dispatchEvent(event);
            }
        }
    } else {
        // Resolve routes based on connections
        const connections = template.connections.filter(c => c.from === task.nodeId);
        
        if (connections.length === 0) {
            // End of process reached
            completeInstance(instance);
        } else {
            // Spawn next steps
            connections.forEach(conn => {
                const nextNode = template.nodes.find(n => n.id === conn.to);
                processNextStep(instance, nextNode, template);
            });
        }
    }

    db.save();
    renderTasks();
}

function processNextStep(instance, nextNode, template) {
    if (!nextNode) return;

    if (nextNode.type === 'gateway') {
        // Evaluate gateway condition expression
        const budget = instance.variables.budget || 0;
        let cond = nextNode.condition;
        
        // Simple expression parser
        let expressionMatched = false;
        try {
            if (cond.includes('>')) {
                const limit = parseFloat(cond.split('>')[1].trim());
                expressionMatched = budget > limit;
            } else if (cond.includes('<')) {
                const limit = parseFloat(cond.split('<')[1].trim());
                expressionMatched = budget < limit;
            } else {
                expressionMatched = true; // Fallback
            }
        } catch (e) {
            console.error("Condition eval failed, default path Yes used", e);
            expressionMatched = true;
        }

        const nextTargetId = expressionMatched ? nextNode.targetYes : nextNode.targetNo;
        const targetNode = template.nodes.find(n => n.id === nextTargetId);
        
        // Log gateway audit log
        instance.auditTrail.push({
            nodeId: nextNode.id,
            action: `gateway_branch_${expressionMatched ? 'yes' : 'no'}`,
            userId: 'system',
            timestamp: db.systemTime
        });

        processNextStep(instance, targetNode, template);
    } else if (nextNode.type === 'end') {
        completeInstance(instance);
    } else {
        // Standard Task or External Task
        instance.currentNodeId = nextNode.id;
        spawnTaskForNode(instance, nextNode);
    }
}

function completeInstance(instance) {
    instance.status = 'completed';
    instance.completedAt = db.systemTime;
    instance.currentNodeId = 'node_end';
    
    instance.auditTrail.push({
        nodeId: 'node_end',
        action: 'end',
        userId: 'system',
        timestamp: db.systemTime
    });

    const event = new CustomEvent('show-toast', {
        detail: {
            message: i18n(currentLanguage,
                `Процесс '${instance.name}' успешно завершен!`,
                `'${instance.name}' процесі сәтті аяқталды!`,
                `Process '${instance.name}' completed successfully!`),
            type: 'success'
        }
    });
    window.dispatchEvent(event);
}

function addComment(taskId, text) {
    if (!text.trim()) return;
    const task = db.tasks.find(t => t.id === taskId);
    if (!task) return;

    const userLabel = db.roles.find(r => r.id === activeUserRoleId);
    const author = userLabel ? (pickName(userLabel, currentLanguage)) : 'Исполнитель';

    task.comments.push({
        user: author,
        text,
        timestamp: db.systemTime
    });

    db.save();
    renderTasks();
}

function attachDocumentMock(taskId) {
    const task = db.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Pick mock name based on task name
    const docName = `Signed_${task.nameRu.replace(/\s+/g, '_')}_Document.pdf`;
    
    task.documents.push({
        name: docName,
        size: '344 KB',
        url: '#'
    });

    db.save();
    renderTasks();

    const event = new CustomEvent('show-toast', {
        detail: {
            message: i18n(currentLanguage, `Файл '${docName}' прикреплен к задаче`, `'${docName}' файлы тапсырмаға тіркелді`, `File '${docName}' attached to the task`),
            type: 'info'
        }
    });
    window.dispatchEvent(event);
}

// SIMULATION CLOCK ENGINE
function startSimulationClock() {
    if (simulationInterval) clearInterval(simulationInterval);

    simulationInterval = setInterval(() => {
        const sysTimeDate = new Date(db.systemTime);
        
        // Time advancement speed: 1 second real-time = db.timeSpeed hours simulated-time
        const speedMultiplier = db.timeSpeed; // 1.0 = 1 hour/sec
        
        sysDateAdvance(sysTimeDate, speedMultiplier);
    }, 1000);
}

function sysDateAdvance(dateObj, hours) {
    dateObj.setMinutes(dateObj.getMinutes() + Math.round(hours * 60));
    db.systemTime = dateObj.toISOString();
    
    // Update visual clock UI element
    const clockEl = document.getElementById('sim-clock');
    if (clockEl) {
        clockEl.textContent = db.systemTime.replace('T', ' ').substring(0, 19);
    }

    // Process SLA calculations for running tasks
    checkSLAThresholds();
}

function checkSLAThresholds() {
    const now = new Date(db.systemTime);
    let stateChanged = false;

    db.tasks.forEach(task => {
        if (task.status !== 'active') return;

        const due = new Date(task.dueDate);
        const diffHours = (due - now) / (1000 * 60 * 60);

        if (diffHours < 0) {
            // SLA breached!
            // Dispatch warning event only if status was previously warning/active
            const isBreachingNow = !task.slaBreached;
            task.slaBreached = true;
            
            if (isBreachingNow) {
                stateChanged = true;
                const msg = i18n(currentLanguage,
                    `Нарушение SLA! Срок выполнения задачи '${task.nameRu}' в инстансе истек!`,
                    `SLA бұзылуы! '${task.nameKk}' тапсырмасының мерзімі өтті!`,
                    `SLA breach! The deadline for task '${pickName(task, 'en')}' has expired!`);
                
                triggerSlaAlertToast(msg, 'danger');
                
                // Record incident in notifications array in database
                logNotification(msg, 'danger', task.nameRu, task.id, task.roleId);
            }
        } else if (diffHours <= 6) {
            // SLA Warning
            const isWarningNow = !task.slaWarning;
            task.slaWarning = true;
            
            if (isWarningNow) {
                stateChanged = true;
                const msg = i18n(currentLanguage,
                    `Внимание! До конца выполнения задачи '${task.nameRu}' осталось меньше 6 часов!`,
                    `Назар аударыңыз! '${task.nameKk}' тапсырмасының бітуіне 6 сағаттан аз қалды!`,
                    `Attention! Less than 6 hours left to complete task '${pickName(task, 'en')}'!`);

                triggerSlaAlertToast(msg, 'warning');
                logNotification(msg, 'warning', task.nameRu);
            }
        }
    });

    if (stateChanged) {
        db.save();
        renderTasks();
        // Notify analytics page that database values changed (refresh dashboards)
        window.dispatchEvent(new CustomEvent('db-updated'));
    }
}

function triggerSlaAlertToast(message, type) {
    const event = new CustomEvent('show-toast', {
        detail: { message, type }
    });
    window.dispatchEvent(event);
}

function logNotification(message, severity, targetName, taskId, roleId) {
    const dateStr = db.systemTime.replace('T', ' ').substring(0, 16);
    
    // Save to window global logs array so all panels can read notification audit trails
    if (!window.bpmSystemNotifications) {
        window.bpmSystemNotifications = [];
    }

    window.bpmSystemNotifications.unshift({
        message,
        severity,
        time: dateStr,
        target: targetName,
        taskId: taskId || null,
        roleId: roleId || null,
        unread: true
    });

    // Update headers notification bell unread state
    const bell = document.getElementById('notif-bell-btn');
    if (bell) bell.classList.add('unread');
    
    // Refresh admin notification feed panel
    window.dispatchEvent(new CustomEvent('notifications-updated'));
}
export function updateSimulationSpeed(speed) {
    db.timeSpeed = parseFloat(speed);
    db.save();
    startSimulationClock();
}
