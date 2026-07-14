import db from './data.js';

let currentLanguage = 'ru';
let activeProcessFilter = 'all';
let matrixDirty = false;
let pendingMatrixState = null;

// DOM Elements
let tableEl, tableBody, searchInput, processFilterSelect, historyContainer, addRowBtn;
let modalCell, modalCellClose, modalCellCancel, modalCellSave, modalCellRoleName, modalCellProcName, modalCellFuncText;
let modalRow, modalRowClose, modalRowCancel, modalRowSave, modalRowRole, modalRowProc, modalRowFunc;
let modalVer, modalVerClose, modalVerCancel, modalVerSave, modalVerCommentText;

export function initMatrix(lang) {
    currentLanguage = lang;
    cacheElements();
    setupListeners();
    populateFilters();
    renderMatrix();
    renderHistory();
}

export function updateLanguage(lang) {
    currentLanguage = lang;
    populateFilters();
    renderMatrix();
    renderHistory();
}

function cacheElements() {
    tableEl = document.getElementById('matrix-table-el');
    tableBody = document.getElementById('matrix-table-body');
    searchInput = document.getElementById('matrix-search');
    processFilterSelect = document.getElementById('matrix-filter-process');
    historyContainer = document.getElementById('matrix-history-container');
    addRowBtn = document.getElementById('matrix-add-row-btn');

    // Modals
    modalCell = document.getElementById('modal-matrix-cell');
    modalCellClose = document.getElementById('modal-matrix-cell-close');
    modalCellCancel = document.getElementById('modal-matrix-cell-cancel');
    modalCellSave = document.getElementById('modal-matrix-cell-save');
    modalCellRoleName = document.getElementById('modal-cell-role-name');
    modalCellProcName = document.getElementById('modal-cell-proc-name');
    modalCellFuncText = document.getElementById('modal-cell-function');

    modalRow = document.getElementById('modal-matrix-row');
    modalRowClose = document.getElementById('modal-matrix-row-close');
    modalRowCancel = document.getElementById('modal-matrix-row-cancel');
    modalRowSave = document.getElementById('modal-matrix-row-save');
    modalRowRole = document.getElementById('modal-row-role');
    modalRowProc = document.getElementById('modal-row-process');
    modalRowFunc = document.getElementById('modal-row-func');

    modalVer = document.getElementById('modal-matrix-version-comment');
    modalVerClose = document.getElementById('modal-matrix-version-close');
    modalVerCancel = document.getElementById('modal-matrix-version-cancel');
    modalVerSave = document.getElementById('modal-matrix-version-save');
    modalVerCommentText = document.getElementById('modal-version-comment');
}

function setupListeners() {
    searchInput.addEventListener('input', renderMatrix);
    processFilterSelect.addEventListener('change', (e) => {
        activeProcessFilter = e.target.value;
        renderMatrix();
    });

    // Excel Export
    document.getElementById('matrix-export-excel').addEventListener('click', exportToExcel);
    
    // PDF Export (using native browser print styles defined in styles.css)
    document.getElementById('matrix-export-pdf').addEventListener('click', () => {
        window.print();
    });

    // Add Row Click
    addRowBtn.addEventListener('click', openAddRowModal);

    // Modal Cell close handlers
    [modalCellClose, modalCellCancel].forEach(el => el.addEventListener('click', () => modalCell.classList.remove('active')));
    modalCellSave.addEventListener('click', saveCellMapping);

    // Modal Row close handlers
    [modalRowClose, modalRowCancel].forEach(el => el.addEventListener('click', () => modalRow.classList.remove('active')));
    modalRowSave.addEventListener('click', saveNewRow);

    // Modal Version Comment close handlers
    [modalVerClose, modalVerCancel].forEach(el => el.addEventListener('click', () => {
        modalVer.classList.remove('active');
        pendingMatrixState = null;
    }));
    modalVerSave.addEventListener('click', commitMatrixVersion);
}

function populateFilters() {
    // Process filter
    const prevVal = processFilterSelect.value || 'all';
    processFilterSelect.innerHTML = `<option value="all">${currentLanguage === 'ru' ? 'Все процессы' : 'Барлық процестер'}</option>`;
    db.templates.forEach(proc => {
        const name = currentLanguage === 'ru' ? proc.nameRu : proc.nameKk;
        processFilterSelect.innerHTML += `<option value="${proc.id}">${name}</option>`;
    });
    processFilterSelect.value = prevVal;
}

export function renderMatrix() {
    if (!tableBody) return;

    const searchTerm = searchInput.value.toLowerCase();
    
    // Determine processes to display (columns)
    const processes = db.templates.filter(p => activeProcessFilter === 'all' || p.id === activeProcessFilter);

    // Render Headers
    const thead = tableEl.querySelector('thead tr');
    thead.innerHTML = `
        <th>${currentLanguage === 'ru' ? 'Роль / Должность' : 'Роль / Лауазым'}</th>
        <th>${currentLanguage === 'ru' ? 'Отдел' : 'Бөлім'}</th>
    `;
    processes.forEach(proc => {
        const name = currentLanguage === 'ru' ? proc.nameRu : proc.nameKk;
        thead.innerHTML += `<th style="min-width: 180px;">${name}</th>`;
    });

    // Render Rows (Roles)
    tableBody.innerHTML = '';
    
    db.roles.forEach(role => {
        const dept = db.departments.find(d => d.id === role.deptId);
        const roleName = currentLanguage === 'ru' ? role.nameRu : role.nameKk;
        const deptName = dept ? (currentLanguage === 'ru' ? dept.nameRu : dept.nameKk) : '';

        // Search Filter
        if (searchTerm && !roleName.toLowerCase().includes(searchTerm) && !deptName.toLowerCase().includes(searchTerm)) {
            return;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600;">${roleName}</td>
            <td style="color: var(--text-muted);">${deptName}</td>
        `;

        processes.forEach(proc => {
            // Find function cell in database mapping
            const mapping = db.matrix.find(m => m.roleId === role.id && m.processId === proc.id);
            const td = document.createElement('td');
            
            if (mapping && mapping.function.trim() !== '') {
                td.innerHTML = `<span class="matrix-cell-func" title="${currentLanguage === 'ru' ? 'Кликните для изменения' : 'Өзгерту үшін басыңыз'}">${mapping.function}</span>`;
            } else {
                td.innerHTML = `<span class="matrix-cell-empty">+ ${currentLanguage === 'ru' ? 'Добавить' : 'Қосу'}</span>`;
            }

            // Cell click handler
            td.addEventListener('click', () => openEditCellModal(role.id, proc.id, mapping ? mapping.function : ''));
            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    });
}

function openEditCellModal(roleId, processId, currentFunc) {
    const role = db.roles.find(r => r.id === roleId);
    const proc = db.templates.find(p => p.id === processId);
    if (!role || !proc) return;

    modalCellRoleName.value = currentLanguage === 'ru' ? role.nameRu : role.nameKk;
    modalCellProcName.value = currentLanguage === 'ru' ? proc.nameRu : proc.nameKk;
    modalCellFuncText.value = currentFunc;
    
    modalCellSave.dataset.roleId = roleId;
    modalCellSave.dataset.processId = processId;
    
    modalCell.classList.add('active');
    modalCellFuncText.focus();
}

function saveCellMapping() {
    const roleId = modalCellSave.dataset.roleId;
    const processId = modalCellSave.dataset.processId;
    const newFunc = modalCellFuncText.value.trim();

    // Update in memory database
    const index = db.matrix.findIndex(m => m.roleId === roleId && m.processId === processId);
    
    if (index >= 0) {
        if (newFunc === '') {
            db.matrix.splice(index, 1); // remove mapping
        } else {
            db.matrix[index].function = newFunc;
        }
    } else if (newFunc !== '') {
        db.matrix.push({ roleId, processId, function: newFunc });
    }

    matrixDirty = true;
    db.save();
    modalCell.classList.remove('active');
    renderMatrix();
    promptVersionCommit();
}

function openAddRowModal() {
    // Populate role select
    modalRowRole.innerHTML = '';
    db.roles.forEach(role => {
        modalRowRole.innerHTML += `<option value="${role.id}">${currentLanguage === 'ru' ? role.nameRu : role.nameKk}</option>`;
    });

    // Populate process select
    modalRowProc.innerHTML = '';
    db.templates.forEach(proc => {
        modalRowProc.innerHTML += `<option value="${proc.id}">${currentLanguage === 'ru' ? proc.nameRu : proc.nameKk}</option>`;
    });

    modalRowFunc.value = '';
    modalRow.classList.add('active');
}

function saveNewRow() {
    const roleId = modalRowRole.value;
    const processId = modalRowProc.value;
    const func = modalRowFunc.value.trim();

    if (func === '') return;

    const index = db.matrix.findIndex(m => m.roleId === roleId && m.processId === processId);
    if (index >= 0) {
        db.matrix[index].function = func;
    } else {
        db.matrix.push({ roleId, processId, function: func });
    }

    matrixDirty = true;
    db.save();
    modalRow.classList.remove('active');
    renderMatrix();
    promptVersionCommit();
}

function promptVersionCommit() {
    if (matrixDirty) {
        modalVerCommentText.value = '';
        modalVer.classList.add('active');
    }
}

function commitMatrixVersion() {
    const comment = modalVerCommentText.value.trim() || (currentLanguage === 'ru' ? 'Ручное обновление ролей' : 'Рөлдерді қолмен жаңарту');
    
    // Determine next version code
    const lastVersion = db.matrixVersions[db.matrixVersions.length - 1];
    let nextVer = "1.0";
    if (lastVersion) {
        const val = parseFloat(lastVersion.version) + 0.1;
        nextVer = val.toFixed(1);
    }

    const date = new Date().toISOString().replace('T', ' ').substring(0, 16);
    
    db.matrixVersions.push({
        version: nextVer,
        date,
        comment,
        matrix: JSON.parse(JSON.stringify(db.matrix)) // deep copy
    });

    matrixDirty = false;
    db.save();
    modalVer.classList.remove('active');
    renderHistory();
    
    // Dispatch toast notification
    const event = new CustomEvent('show-toast', {
        detail: {
            message: currentLanguage === 'ru' ? `Матрица сохранена! Версия ${nextVer}` : `Матрица сақталды! Нұсқа ${nextVer}`,
            type: 'success'
        }
    });
    window.dispatchEvent(event);
}

function renderHistory() {
    if (!historyContainer) return;
    historyContainer.innerHTML = '';

    // Render list in reverse order (newest first)
    const reversed = [...db.matrixVersions].reverse();
    reversed.forEach((ver, index) => {
        const item = document.createElement('div');
        item.className = 'matrix-history-item';
        item.innerHTML = `
            <div class="matrix-history-meta">
                <span style="font-weight:700; color:var(--primary)">v${ver.version}</span>
                <span>${ver.date}</span>
            </div>
            <div class="matrix-history-comment">${ver.comment}</div>
        `;

        // Don't allow rollback on current version (first item in reversed array)
        if (index > 0) {
            const rollbackBtn = document.createElement('button');
            rollbackBtn.className = 'btn btn-secondary';
            rollbackBtn.style.padding = '4px 8px';
            rollbackBtn.style.fontSize = '0.7rem';
            rollbackBtn.style.marginTop = '4px';
            rollbackBtn.innerText = currentLanguage === 'ru' ? 'Откатить' : 'Қалпына келтіру';
            rollbackBtn.addEventListener('click', () => rollbackTo(ver.version));
            item.appendChild(rollbackBtn);
        } else {
            const currentBadge = document.createElement('span');
            currentBadge.className = 'task-badge active';
            currentBadge.style.fontSize = '0.65rem';
            currentBadge.innerText = currentLanguage === 'ru' ? 'Текущая версия' : 'Ағымдағы нұсқа';
            item.appendChild(currentBadge);
        }

        historyContainer.appendChild(item);
    });
}

function rollbackTo(versionId) {
    const target = db.matrixVersions.find(v => v.version === versionId);
    if (!target) return;

    if (confirm(currentLanguage === 'ru' ? `Вы действительно хотите откатить матрицу к версии v${versionId}?` : `Матрицаны шынымен v${versionId} нұсқасына қайтарғыңыз келе ме?`)) {
        db.matrix = JSON.parse(JSON.stringify(target.matrix));
        
        // Add a new log recording the rollback event
        const nextVer = (parseFloat(db.matrixVersions[db.matrixVersions.length - 1].version) + 0.1).toFixed(1);
        const date = new Date().toISOString().replace('T', ' ').substring(0, 16);
        
        db.matrixVersions.push({
            version: nextVer,
            date,
            comment: currentLanguage === 'ru' ? `Откат к версии v${versionId}` : `v${versionId} нұсқасына қалпына келтіру`,
            matrix: JSON.parse(JSON.stringify(db.matrix))
        });

        db.save();
        renderMatrix();
        renderHistory();

        const event = new CustomEvent('show-toast', {
            detail: {
                message: currentLanguage === 'ru' ? `Выполнен откат к версии ${versionId}` : `${versionId} нұсқасына қалпына келтірілді`,
                type: 'warning'
            }
        });
        window.dispatchEvent(event);
    }
}

function exportToExcel() {
    // Generates CSV output
    let csvContent = "\uFEFF"; // UTF-8 BOM
    
    // Header
    const processes = db.templates;
    let headerRow = ["Роль / Должность", "Отдел"];
    processes.forEach(proc => {
        headerRow.push(currentLanguage === 'ru' ? proc.nameRu : proc.nameKk);
    });
    csvContent += headerRow.map(h => `"${h.replace(/"/g, '""')}"`).join(";") + "\n";

    // Rows
    db.roles.forEach(role => {
        const dept = db.departments.find(d => d.id === role.deptId);
        const roleName = currentLanguage === 'ru' ? role.nameRu : role.nameKk;
        const deptName = dept ? (currentLanguage === 'ru' ? dept.nameRu : dept.nameKk) : '';
        
        let row = [roleName, deptName];
        processes.forEach(proc => {
            const mapping = db.matrix.find(m => m.roleId === role.id && m.processId === proc.id);
            row.push(mapping ? mapping.function : "");
        });

        csvContent += row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(";") + "\n";
    });

    // Trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `role_functional_matrix_${currentLanguage}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}
