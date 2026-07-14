import db from './data.js';
import { updateSimulationSpeed } from './engine.js';

let currentLanguage = 'ru';

// DOM elements cache
let deptsList, addDeptNameRu, addDeptNameKk, addDeptBtn;
let rolesList, addRoleNameRu, addRoleNameKk, addRoleDeptSelect, addRoleBtn;
let simSpeedSlider, simSpeedLabel, simResetBtn;

export function initAdmin(lang) {
    currentLanguage = lang;
    cacheElements();
    setupListeners();
    renderDepts();
    renderRoles();
    renderSimSettings();
}

export function updateLanguage(lang) {
    currentLanguage = lang;
    renderDepts();
    renderRoles();
    renderSimSettings();
}

function cacheElements() {
    deptsList = document.getElementById('admin-depts-list');
    addDeptNameRu = document.getElementById('admin-add-dept-name-ru');
    addDeptNameKk = document.getElementById('admin-add-dept-name-kk');
    addDeptBtn = document.getElementById('admin-add-dept-btn');

    rolesList = document.getElementById('admin-roles-list');
    addRoleNameRu = document.getElementById('admin-add-role-name-ru');
    addRoleNameKk = document.getElementById('admin-add-role-name-kk');
    addRoleDeptSelect = document.getElementById('admin-add-role-dept');
    addRoleBtn = document.getElementById('admin-add-role-btn');

    simSpeedSlider = document.getElementById('admin-sim-speed-slider');
    simSpeedLabel = document.getElementById('admin-sim-speed-label');
    simResetBtn = document.getElementById('admin-sim-reset-btn');
}

function setupListeners() {
    addDeptBtn.addEventListener('click', addDepartment);
    addRoleBtn.addEventListener('click', addRole);
    
    simSpeedSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        simSpeedLabel.textContent = `${val}x`;
        updateSimulationSpeed(val);
    });

    simResetBtn.addEventListener('click', resetDatabase);
}

function renderDepts() {
    if (!deptsList) return;
    deptsList.innerHTML = '';
    
    // Clear select options first
    addRoleDeptSelect.innerHTML = '';

    db.departments.forEach(dept => {
        const name = currentLanguage === 'ru' ? dept.nameRu : dept.nameKk;
        const li = document.createElement('li');
        li.className = 'admin-list-item';
        li.innerHTML = `
            <span>${name}</span>
            <button class="admin-list-remove" data-id="${dept.id}">&times;</button>
        `;

        li.querySelector('.admin-list-remove').addEventListener('click', () => removeDepartment(dept.id));
        deptsList.appendChild(li);

        // Fill roles mapping selector in admin adding form
        addRoleDeptSelect.innerHTML += `<option value="${dept.id}">${name}</option>`;
    });
}

function renderRoles() {
    if (!rolesList) return;
    rolesList.innerHTML = '';

    db.roles.forEach(role => {
        const dept = db.departments.find(d => d.id === role.deptId);
        const deptName = dept ? (currentLanguage === 'ru' ? dept.nameRu : dept.nameKk) : '';
        const name = currentLanguage === 'ru' ? role.nameRu : role.nameKk;
        
        const li = document.createElement('li');
        li.className = 'admin-list-item';
        li.innerHTML = `
            <div>
                <span style="font-weight:600">${name}</span>
                <span style="font-size:0.75rem; color:var(--text-muted); display:block;">${deptName}</span>
            </div>
            <button class="admin-list-remove" data-id="${role.id}">&times;</button>
        `;

        li.querySelector('.admin-list-remove').addEventListener('click', () => removeRole(role.id));
        rolesList.appendChild(li);
    });
}

function renderSimSettings() {
    if (!simSpeedSlider) return;
    simSpeedSlider.value = db.timeSpeed;
    simSpeedLabel.textContent = `${db.timeSpeed}x`;
}

function addDepartment() {
    const nameRu = addDeptNameRu.value.trim();
    const nameKk = addDeptNameKk.value.trim();
    if (nameRu === '' || nameKk === '') return;

    const id = `dept_${Date.now()}`;
    db.departments.push({ id, nameRu, nameKk });
    db.save();

    addDeptNameRu.value = '';
    addDeptNameKk.value = '';
    renderDepts();

    // Trigger update components notifications dropdown
    window.dispatchEvent(new CustomEvent('db-updated'));
}

function removeDepartment(deptId) {
    // Check if roles are associated with this dept
    const hasRoles = db.roles.some(r => r.deptId === deptId);
    if (hasRoles) {
        alert(currentLanguage === 'ru' 
            ? 'Ошибка: невозможно удалить отдел, в котором содержатся активные роли!' 
            : 'Қате: ішінде белсенді рольдері бар бөлімді жою мүмкін емес!');
        return;
    }

    db.departments = db.departments.filter(d => d.id !== deptId);
    db.save();
    renderDepts();
    window.dispatchEvent(new CustomEvent('db-updated'));
}

function addRole() {
    const nameRu = addRoleNameRu.value.trim();
    const nameKk = addRoleNameKk.value.trim();
    const deptId = addRoleDeptSelect.value;
    if (nameRu === '' || nameKk === '') return;

    const id = `role_${Date.now()}`;
    db.roles.push({ id, nameRu, nameKk, deptId });
    db.save();

    addRoleNameRu.value = '';
    addRoleNameKk.value = '';
    renderRoles();
    
    // Dispatch events to reload matrices and drop selectors
    window.dispatchEvent(new CustomEvent('db-updated'));
}

function removeRole(roleId) {
    if (confirm(currentLanguage === 'ru' ? 'Удалить эту роль из справочника?' : 'Бұл рольді анықтамалықтан жою керек пе?')) {
        db.roles = db.roles.filter(r => r.id !== roleId);
        db.save();
        renderRoles();
        window.dispatchEvent(new CustomEvent('db-updated'));
    }
}

function resetDatabase() {
    if (confirm(currentLanguage === 'ru' 
        ? 'Вы действительно хотите сбросить все изменения? Это удалит ваши процессы, задачи и настройки.' 
        : 'Шынымен барлық өзгерістерді нөлге түсіргіңіз келе ме? Бұл сіздің процестеріңізді, тапсырмаларыңызды және баптауларыңызды жояды.')) {
        db.reset();
        window.location.reload();
    }
}
