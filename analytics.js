import { pickName, tr as i18n } from './locale.js?v=2.0.0';
import db from './data.js?v=2.0.0';

let currentLanguage = 'ru';

// DOM elements cache
let kpiActive, kpiCompleted, kpiSLA, kpiAvgTime, chartProcessTime, chartDeptLoad, bottleneckBody;

export function initAnalytics(lang) {
    currentLanguage = lang;
    cacheElements();
    calculateKPIs();
    renderCharts();
    renderBottlenecks();

    // Listen to updates
    window.addEventListener('db-updated', () => {
        calculateKPIs();
        renderCharts();
        renderBottlenecks();
    });
}

export function updateLanguage(lang) {
    currentLanguage = lang;
    calculateKPIs();
    renderCharts();
    renderBottlenecks();
}

function cacheElements() {
    kpiActive = document.getElementById('kpi-active-count');
    kpiCompleted = document.getElementById('kpi-completed-count');
    kpiSLA = document.getElementById('kpi-sla-compliance');
    kpiAvgTime = document.getElementById('kpi-avg-duration');
    chartProcessTime = document.getElementById('chart-process-time');
    chartDeptLoad = document.getElementById('chart-dept-load');
    bottleneckBody = document.getElementById('analytics-bottleneck-body');
}

function calculateKPIs() {
    // 1. Active & Completed instances counts
    const activeInsts = db.instances.filter(i => i.status === 'active');
    const completedInsts = db.instances.filter(i => i.status === 'completed');

    kpiActive.textContent = activeInsts.length;
    kpiCompleted.textContent = completedInsts.length;

    // 2. SLA Compliance Rate
    // Count active and completed tasks that are overdue
    const totalTasks = db.tasks.length;
    const breachedTasks = db.tasks.filter(t => {
        if (t.status === 'completed') {
            // Task was completed, check if it was completed past due date
            return new Date(t.completedAt) > new Date(t.dueDate);
        } else {
            // Task is active, check if current time is past due date
            return new Date(db.systemTime) > new Date(t.dueDate);
        }
    }).length;

    let compliancePercent = 100;
    if (totalTasks > 0) {
        compliancePercent = Math.round(((totalTasks - breachedTasks) / totalTasks) * 100);
    }
    kpiSLA.textContent = `${compliancePercent}%`;

    // Adjust KPI card color based on compliance
    kpiSLA.className = `kpi-val ${compliancePercent >= 90 ? 'success' : (compliancePercent >= 75 ? 'warning' : 'danger')}`;

    // 3. Average Process Cycle Duration (in simulated hours)
    let totalHours = 0;
    let countedInsts = 0;

    completedInsts.forEach(inst => {
        const start = new Date(inst.startedAt);
        const end = new Date(inst.completedAt);
        const diffHours = (end - start) / (1000 * 60 * 60);
        totalHours += diffHours;
        countedInsts++;
    });

    const avgHours = countedInsts > 0 ? Math.round(totalHours / countedInsts) : 0;
    kpiAvgTime.textContent = `${avgHours} ${i18n(currentLanguage, 'ч', 'сағ', 'h')}`;
}

function renderCharts() {
    renderProcessTimeChart();
    renderDeptLoadChart();
}

function renderProcessTimeChart() {
    if (!chartProcessTime) return;

    // Compute average duration per template type
    const data = db.templates.map(temp => {
        const insts = db.instances.filter(i => i.templateId === temp.id && i.status === 'completed');
        let totalHours = 0;
        insts.forEach(inst => {
            const start = new Date(inst.startedAt);
            const end = new Date(inst.completedAt);
            totalHours += (end - start) / (1000 * 60 * 60);
        });

        // If no completed runs, show default sum of SLA configurations in template
        let avg = insts.length > 0 ? Math.round(totalHours / insts.length) : 0;
        if (avg === 0) {
            avg = temp.nodes.reduce((acc, n) => acc + (n.sla || 0), 0);
        }

        return {
            name: pickName(temp, currentLanguage),
            value: avg
        };
    });

    // Draw SVG Chart
    const width = 450;
    const height = 220;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const maxVal = Math.max(...data.map(d => d.value), 24); // scale max value

    let barsHtml = '';
    const barWidth = Math.min(60, chartWidth / (data.length || 1) - 20);
    const spacing = chartWidth / (data.length || 1);

    data.forEach((d, idx) => {
        const barHeight = (d.value / maxVal) * chartHeight;
        const x = padding + idx * spacing + (spacing - barWidth) / 2;
        const y = padding + chartHeight - barHeight;

        // Visual SVG tags
        barsHtml += `
            <rect class="chart-bar" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" />
            <text class="chart-label" x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle">${d.value}h</text>
            <text class="chart-label" x="${x + barWidth / 2}" y="${padding + chartHeight + 16}" text-anchor="middle">
                ${d.name.length > 12 ? d.name.substring(0, 10) + '..' : d.name}
            </text>
        `;
    });

    chartProcessTime.innerHTML = `
        <svg class="chart-svg" viewBox="0 0 ${width} ${height}">
            <!-- Axes -->
            <line class="chart-axis" x1="${padding}" y1="${padding}" x2="${padding}" y2="${padding + chartHeight}" />
            <line class="chart-axis" x1="${padding}" y1="${padding + chartHeight}" x2="${padding + chartWidth}" y2="${padding + chartHeight}" />
            
            <!-- Grid scale lines -->
            <line class="chart-axis" stroke-dasharray="3" x1="${padding}" y1="${padding + chartHeight / 2}" x2="${padding + chartWidth}" y2="${padding + chartHeight / 2}" />
            <text class="chart-label" x="${padding - 8}" y="${padding + chartHeight / 2 + 4}" text-anchor="end">${Math.round(maxVal / 2)}h</text>
            <text class="chart-label" x="${padding - 8}" y="${padding + 4}" text-anchor="end">${maxVal}h</text>

            <!-- Data bars -->
            ${barsHtml}
        </svg>
    `;
}

function renderDeptLoadChart() {
    if (!chartDeptLoad) return;

    // Active tasks grouped by Department ID
    const deptsData = db.departments.map(dept => {
        // Count tasks in active instances assigned to roles of this dept
        const rolesInDept = db.roles.filter(r => r.deptId === dept.id).map(r => r.id);
        const count = db.tasks.filter(t => t.status === 'active' && rolesInDept.includes(t.roleId)).length;

        return {
            name: pickName(dept, currentLanguage),
            value: count
        };
    });

    const width = 450;
    const height = 220;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const maxVal = Math.max(...deptsData.map(d => d.value), 4); // scale max

    let barsHtml = '';
    const barWidth = Math.min(50, chartWidth / (deptsData.length || 1) - 15);
    const spacing = chartWidth / (deptsData.length || 1);

    deptsData.forEach((d, idx) => {
        const barHeight = (d.value / maxVal) * chartHeight;
        const x = padding + idx * spacing + (spacing - barWidth) / 2;
        const y = padding + chartHeight - barHeight;

        barsHtml += `
            <rect class="chart-bar" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="url(#purpleGlow)" style="fill: #a855f7" />
            <text class="chart-label" x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle">${d.value}</text>
            <text class="chart-label" x="${x + barWidth / 2}" y="${padding + chartHeight + 16}" text-anchor="middle">
                ${d.name.length > 10 ? d.name.substring(0, 8) + '..' : d.name}
            </text>
        `;
    });

    chartDeptLoad.innerHTML = `
        <svg class="chart-svg" viewBox="0 0 ${width} ${height}">
            <!-- Axes -->
            <line class="chart-axis" x1="${padding}" y1="${padding}" x2="${padding}" y2="${padding + chartHeight}" />
            <line class="chart-axis" x1="${padding}" y1="${padding + chartHeight}" x2="${padding + chartWidth}" y2="${padding + chartHeight}" />
            
            <line class="chart-axis" stroke-dasharray="3" x1="${padding}" y1="${padding + chartHeight / 2}" x2="${padding + chartWidth}" y2="${padding + chartHeight / 2}" />
            <text class="chart-label" x="${padding - 8}" y="${padding + chartHeight / 2 + 4}" text-anchor="end">${Math.round(maxVal / 2)}</text>
            <text class="chart-label" x="${padding - 8}" y="${padding + 4}" text-anchor="end">${maxVal}</text>

            ${barsHtml}
        </svg>
    `;
}

function renderBottlenecks() {
    if (!bottleneckBody) return;
    bottleneckBody.innerHTML = '';

    // Filter tasks which breached SLA or have SLA alerts
    const SLAIncidents = db.tasks.filter(t => {
        const isOverdue = new Date(db.systemTime) > new Date(t.dueDate);
        const isWarning = !isOverdue && ((new Date(t.dueDate) - new Date(db.systemTime)) / (1000 * 60 * 60) <= 6);
        return t.status === 'active' && (isOverdue || isWarning);
    });

    if (SLAIncidents.length === 0) {
        bottleneckBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted); font-style: italic;">
                    ${i18n(currentLanguage, 'Активных SLA инцидентов не зафиксировано', 'SLA бұзылу оқиғалары тіркелген жоқ', 'No active SLA incidents recorded')}
                </td>
            </tr>
        `;
        return;
    }

    SLAIncidents.forEach(task => {
        const instance = db.instances.find(i => i.id === task.instanceId);
        const processName = instance ? instance.name : 'Unknown Process';
        const role = db.roles.find(r => r.id === task.roleId);
        const roleName = role ? (pickName(role, currentLanguage)) : 'Исполнитель';
        
        const isOverdue = new Date(db.systemTime) > new Date(task.dueDate);
        const badgeClass = isOverdue ? 'danger' : 'warning';
        const badgeLabel = isOverdue 
            ? (i18n(currentLanguage, 'Просрочено', 'Мерзімі өткен', 'Overdue')) 
            : (i18n(currentLanguage, 'Срок истекает', 'Мерзімі таяу', 'Due soon'));

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600;">${processName}</td>
            <td>${pickName(task, currentLanguage)}</td>
            <td style="color: var(--text-muted);">${roleName}</td>
            <td>${task.createdAt.replace('T', ' ').substring(0, 16)}</td>
            <td><span class="task-badge ${badgeClass}">${badgeLabel}</span></td>
        `;
        bottleneckBody.appendChild(tr);
    });
}
