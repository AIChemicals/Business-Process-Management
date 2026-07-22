import db from './data.js?v=1.0.5';
import { customPrompt } from './dialogs.js?v=1.0.5';

let currentLanguage = 'ru';
let activeTemplate = null;
let selectedNode = null;
let selectedConnection = null;
let currentTool = 'select'; // 'select', 'task', 'gateway', 'external', 'connect', 'delete'

// SVG dragging and drawing states
let isDragging = false;
let dragNode = null;
let dragOffset = { x: 0, y: 0 };
let connectStartNode = null;
let tempLine = null;

// Pan & Zoom states
let panX = 0;
let panY = 0;
let zoom = 1.0;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let startClientX = 0;
let startClientY = 0;

// DOM Elements
let canvasWrapper, svgCanvas, processSelect, newBtn, saveBtn, runBtn;
let inspectorEmpty, inspectorForm, inspectNodeId, inspectNodeName, inspectNodeRole, inspectNodeSLA, inspectApplyBtn;
let inspectGatewayGroup, inspectGatewayCond, inspectGatewayYes, inspectGatewayNo, inspectRoleGroup, inspectSLAGroup;

export function initModeler(lang) {
    currentLanguage = lang;
    cacheElements();
    setupListeners();
    populateProcessList();
    loadTemplate(processSelect.value);
}

export function updateLanguage(lang) {
    currentLanguage = lang;
    populateProcessList();
    loadTemplate(processSelect.value);
    populateInspectorOptions();
}

function cacheElements() {
    canvasWrapper = document.querySelector('.modeler-canvas-wrapper');
    svgCanvas = document.getElementById('modeler-svg-canvas');
    processSelect = document.getElementById('modeler-process-select');
    newBtn = document.getElementById('modeler-new-btn');
    saveBtn = document.getElementById('modeler-save-btn');
    runBtn = document.getElementById('modeler-run-btn');

    // Inspector
    inspectorEmpty = document.getElementById('inspector-empty-state');
    inspectorForm = document.getElementById('inspector-form-state');
    inspectNodeId = document.getElementById('inspect-node-id');
    inspectNodeName = document.getElementById('inspect-node-name');
    inspectNodeRole = document.getElementById('inspect-node-role');
    inspectNodeSLA = document.getElementById('inspect-node-sla');
    inspectGatewayGroup = document.getElementById('inspect-gateway-group');
    inspectGatewayCond = document.getElementById('inspect-node-cond');
    inspectGatewayYes = document.getElementById('inspect-node-yes');
    inspectGatewayNo = document.getElementById('inspect-node-no');
    inspectRoleGroup = document.getElementById('inspect-role-group');
    inspectSLAGroup = document.getElementById('inspect-sla-group');
    inspectApplyBtn = document.getElementById('inspect-apply-btn');
}

function setupListeners() {
    // Toolbar Tools Click
    document.querySelectorAll('.modeler-tool').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.modeler-tool').forEach(b => b.classList.remove('active'));
            const targetBtn = e.currentTarget;
            targetBtn.classList.add('active');
            currentTool = targetBtn.id.replace('tool-', '');
            
            // Clear selection unless in select mode
            if (currentTool !== 'select') {
                clearSelection();
            }
        });
    });

    // Dropdown template switch
    processSelect.addEventListener('change', (e) => {
        loadTemplate(e.target.value);
    });

    // New Template
    newBtn.addEventListener('click', createNewTemplate);

    // Save Template
    saveBtn.addEventListener('click', saveActiveTemplate);

    // Run Simulation Shortcut
    runBtn.addEventListener('click', () => {
        if (!activeTemplate) return;
        const event = new CustomEvent('trigger-simulate-process', {
            detail: { templateId: activeTemplate.id }
        });
        window.dispatchEvent(event);
    });

    // Apply Inspector Changes
    inspectApplyBtn.addEventListener('click', applyInspectorChanges);

    // Canvas Events
    svgCanvas.addEventListener('mousedown', onCanvasMouseDown);
    window.addEventListener('mousemove', onCanvasMouseMove);
    window.addEventListener('mouseup', onCanvasMouseUp);

    // Zoom & Pan listeners
    canvasWrapper.addEventListener('wheel', onCanvasWheel, { passive: false });

    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomValBtn = document.getElementById('zoom-value');

    if (zoomInBtn) zoomInBtn.addEventListener('click', zoomIn);
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', zoomOut);
    if (zoomValBtn) zoomValBtn.addEventListener('click', resetZoom);

    window.addEventListener('resize', updateViewBox);
}

function populateProcessList() {
    const prevVal = processSelect.value || '';
    processSelect.innerHTML = '';
    db.templates.forEach(t => {
        const name = currentLanguage === 'ru' ? t.nameRu : t.nameKk;
        processSelect.innerHTML += `<option value="${t.id}">${name} (v${t.version})</option>`;
    });
    if (prevVal && db.templates.find(t => t.id === prevVal)) {
        processSelect.value = prevVal;
    }
}

function loadTemplate(templateId) {
    activeTemplate = db.templates.find(t => t.id === templateId);
    clearSelection();
    resetZoom();
}

function updateViewBox() {
    if (!svgCanvas) return;
    const rect = svgCanvas.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 500;
    svgCanvas.setAttribute('viewBox', `${panX} ${panY} ${w * zoom} ${h * zoom}`);

    const zoomValEl = document.getElementById('zoom-value');
    if (zoomValEl) {
        zoomValEl.textContent = Math.round(100 / zoom) + '%';
    }
}

function zoomTo(newZoom, centerX, centerY) {
    panX = panX + centerX * (zoom - newZoom);
    panY = panY + centerY * (zoom - newZoom);
    zoom = newZoom;
    updateViewBox();
}

function zoomIn() {
    const rect = svgCanvas.getBoundingClientRect();
    const newZoom = Math.max(0.3, zoom / 1.15);
    zoomTo(newZoom, rect.width / 2, rect.height / 2);
}

function zoomOut() {
    const rect = svgCanvas.getBoundingClientRect();
    const newZoom = Math.min(3.0, zoom * 1.15);
    zoomTo(newZoom, rect.width / 2, rect.height / 2);
}

function resetZoom() {
    panX = 0;
    panY = 0;
    zoom = 1.0;
    updateViewBox();
    renderCanvas();
}

function clearSelection() {
    selectedNode = null;
    selectedConnection = null;
    hideInspector();
    
    // Remove selected CSS highlight classes
    document.querySelectorAll('.bpmn-node').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.bpmn-connection').forEach(el => el.classList.remove('selected'));
}

function renderCanvas() {
    if (!svgCanvas || !activeTemplate) return;
    
    updateViewBox();
    
    // Clear previous drawing, keeping <defs> marker styles
    const defs = svgCanvas.querySelector('defs');
    svgCanvas.innerHTML = '';
    if (defs) svgCanvas.appendChild(defs);

    // 1. Draw Connection Lines first (so they sit below nodes visually)
    activeTemplate.connections.forEach(conn => {
        drawConnectionLine(conn);
    });

    // 2. Draw Nodes
    activeTemplate.nodes.forEach(node => {
        drawNodeElement(node);
    });
}

function drawNodeElement(node) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'bpmn-node');
    g.setAttribute('id', `dom-node-${node.id}`);
    g.dataset.id = node.id;
    
    if (selectedNode && selectedNode.id === node.id) {
        g.classList.add('selected');
    }

    const labelText = currentLanguage === 'ru' ? node.nameRu : node.nameKk;

    // Node Type Layouts
    if (node.type === 'start') {
        // Circle (Green)
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', node.x);
        circle.setAttribute('cy', node.y);
        circle.setAttribute('r', 24);
        circle.setAttribute('stroke', '#10b981');
        circle.setAttribute('stroke-width', '2.5');
        circle.setAttribute('fill', '#091512');
        g.appendChild(circle);

        addNodeText(g, node.x, node.y + 40, labelText);
    } else if (node.type === 'end') {
        // Thick Circle (Red)
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', node.x);
        circle.setAttribute('cy', node.y);
        circle.setAttribute('r', 24);
        circle.setAttribute('stroke', '#ef4444');
        circle.setAttribute('stroke-width', '4');
        circle.setAttribute('fill', '#1c0e12');
        g.appendChild(circle);

        addNodeText(g, node.x, node.y + 40, labelText);
    } else if (node.type === 'gateway') {
        // Diamond (Orange)
        const points = `${node.x},${node.y - 28} ${node.x + 28},${node.y} ${node.x},${node.y + 28} ${node.x - 28},${node.y}`;
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', points);
        poly.setAttribute('stroke', '#f59e0b');
        poly.setAttribute('stroke-width', '2.5');
        poly.setAttribute('fill', '#1c150c');
        g.appendChild(poly);

        // Draw an 'X' or '?' symbol in the diamond
        const sym = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        sym.setAttribute('x', node.x);
        sym.setAttribute('y', node.y + 5);
        sym.setAttribute('text-anchor', 'middle');
        sym.setAttribute('fill', '#f59e0b');
        sym.setAttribute('font-weight', 'bold');
        sym.setAttribute('font-size', '16');
        sym.textContent = '?';
        g.appendChild(sym);

        addNodeText(g, node.x, node.y + 45, labelText);
    } else {
        // Task/External (Rectangle - Blue/Purple)
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', node.x - 60);
        rect.setAttribute('y', node.y - 25);
        rect.setAttribute('width', 120);
        rect.setAttribute('height', 50);
        rect.setAttribute('rx', '8');
        rect.setAttribute('ry', '8');

        if (node.type === 'external') {
            rect.setAttribute('stroke', '#a855f7'); // Purple
            rect.setAttribute('fill', '#140c1d');
        } else {
            rect.setAttribute('stroke', '#6366f1'); // Indigo/Blue
            rect.setAttribute('fill', '#0e0f22');
        }
        rect.setAttribute('stroke-width', '2');
        g.appendChild(rect);

        // Add small icon for external organizations
        if (node.type === 'external') {
            const extIcon = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            extIcon.setAttribute('cx', node.x - 46);
            extIcon.setAttribute('cy', node.y - 12);
            extIcon.setAttribute('r', 5);
            extIcon.setAttribute('stroke', '#a855f7');
            extIcon.setAttribute('stroke-width', '1');
            extIcon.setAttribute('fill', 'none');
            g.appendChild(extIcon);
        }

        // Multi-line wrap text within task rect
        addTaskText(g, node.x, node.y, labelText);
    }

    svgCanvas.appendChild(g);
}

function addNodeText(group, x, y, text) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('text-anchor', 'middle');
    el.setAttribute('fill', 'var(--text-main)');
    el.setAttribute('font-size', '11');
    el.setAttribute('font-weight', '500');
    el.textContent = text;
    group.appendChild(el);
}

function addTaskText(group, x, y, text) {
    // Splits text to fit task rect
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    el.setAttribute('x', x);
    el.setAttribute('y', y - 4);
    el.setAttribute('text-anchor', 'middle');
    el.setAttribute('fill', 'var(--text-main)');
    el.setAttribute('font-size', '10');
    el.setAttribute('font-weight', '500');

    // Split words
    const words = text.split(' ');
    let lines = [];
    let currentLine = '';

    words.forEach(word => {
        if ((currentLine + ' ' + word).length > 20) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = currentLine === '' ? word : currentLine + ' ' + word;
        }
    });
    lines.push(currentLine);

    // Draw tspan elements
    lines = lines.slice(0, 3); // limit to 3 lines
    lines.forEach((line, idx) => {
        const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        tspan.setAttribute('x', x);
        tspan.setAttribute('dy', idx === 0 ? '5' : '12');
        tspan.textContent = line;
        el.appendChild(tspan);
    });

    group.appendChild(el);
}

function drawConnectionLine(conn) {
    const fromNode = activeTemplate.nodes.find(n => n.id === conn.from);
    const toNode = activeTemplate.nodes.find(n => n.id === conn.to);
    if (!fromNode || !toNode) return;

    // Boundary math for connection terminals
    const start = getTerminalPoint(fromNode, toNode);
    const end = getTerminalPoint(toNode, fromNode);

    // Compute orthogonal (bendable) route
    const pathData = getOrthogonalPath(start, end, fromNode.type, toNode.type);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('class', 'bpmn-connection');
    path.setAttribute('marker-end', 'url(#arrow)');
    path.dataset.from = conn.from;
    path.dataset.to = conn.to;

    if (selectedConnection && selectedConnection.from === conn.from && selectedConnection.to === conn.to) {
        path.setAttribute('stroke', '#6366f1');
        path.setAttribute('stroke-width', '3');
        path.setAttribute('marker-end', 'url(#arrow-selected)');
    }

    svgCanvas.appendChild(path);

    // Draw conditional labels (Yes/No) for gateways
    if (fromNode.type === 'gateway') {
        const isYes = conn.to === fromNode.targetYes;
        const isNo = conn.to === fromNode.targetNo;
        
        if (isYes || isNo) {
            const labelText = isYes ? (currentLanguage === 'ru' ? 'Да' : 'Иә') : (currentLanguage === 'ru' ? 'Нет' : 'Жоқ');
            
            // Draw text tag near starting route segment
            const textX = start.x + (end.x > start.x ? 20 : -20);
            const textY = start.y + (end.y > start.y ? 15 : -15);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', textX);
            text.setAttribute('y', textY);
            text.setAttribute('fill', '#f59e0b');
            text.setAttribute('font-size', '10');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('text-anchor', 'middle');
            text.textContent = labelText;
            svgCanvas.appendChild(text);
        }
    }
}

function getTerminalPoint(node, target) {
    // Approximate node boundaries for clean arrow terminations
    if (node.type === 'start' || node.type === 'end') {
        const angle = Math.atan2(target.y - node.y, target.x - node.x);
        return {
            x: node.x + 24 * Math.cos(angle),
            y: node.y + 24 * Math.sin(angle)
        };
    } else if (node.type === 'gateway') {
        const angle = Math.atan2(target.y - node.y, target.x - node.x);
        return {
            x: node.x + 28 * Math.cos(angle),
            y: node.y + 28 * Math.sin(angle)
        };
    } else {
        // Rectangle node terminal computation
        const dx = target.x - node.x;
        const dy = target.y - node.y;
        
        let targetX = node.x;
        let targetY = node.y;

        if (Math.abs(dx) > Math.abs(dy)) {
            // Terminate left/right boundary
            targetX += dx > 0 ? 60 : -60;
        } else {
            // Terminate top/bottom boundary
            targetY += dy > 0 ? 25 : -25;
        }

        return { x: targetX, y: targetY };
    }
}

function getOrthogonalPath(start, end, fromType, toType) {
    // Simple orthogonal paths: line bends in L shape
    const midX = start.x + (end.x - start.x) / 2;
    return `M ${start.x} ${start.y} H ${midX} V ${end.y} H ${end.x}`;
}

// Canvas Mouse Interactions
function onCanvasMouseDown(e) {
    const target = e.target.closest('.bpmn-node');
    const pathTarget = e.target.closest('.bpmn-connection');
    const coords = getCanvasCoords(e);

    // If clicking on empty space (not a node and not a connection)
    if (!target && !pathTarget) {
        if (['select', 'connect', 'delete'].includes(currentTool)) {
            clearSelection();
            isPanning = true;
            startPanX = panX;
            startPanY = panY;
            startClientX = e.clientX;
            startClientY = e.clientY;
            canvasWrapper.style.cursor = 'grabbing';
            return;
        }
    }

    if (currentTool === 'select') {
        if (target) {
            isDragging = true;
            const nodeId = target.dataset.id;
            dragNode = activeTemplate.nodes.find(n => n.id === nodeId);
            dragOffset.x = coords.x - dragNode.x;
            dragOffset.y = coords.y - dragNode.y;
            
            selectNode(dragNode);
        } else if (pathTarget) {
            selectConnection(pathTarget.dataset.from, pathTarget.dataset.to);
        }
    } else if (currentTool === 'connect') {
        if (target) {
            connectStartNode = activeTemplate.nodes.find(n => n.id === target.dataset.id);
            
            // Create temporary drawing path line
            tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tempLine.setAttribute('x1', connectStartNode.x);
            tempLine.setAttribute('y1', connectStartNode.y);
            tempLine.setAttribute('x2', coords.x);
            tempLine.setAttribute('y2', coords.y);
            tempLine.setAttribute('stroke', '#6366f1');
            tempLine.setAttribute('stroke-width', '2');
            tempLine.setAttribute('stroke-dasharray', '4');
            svgCanvas.appendChild(tempLine);
        }
    } else if (['task', 'gateway', 'external'].includes(currentTool)) {
        if (!target && !pathTarget) {
            // Place new Node
            const newNodeId = `node_${Date.now()}`;
            const type = currentTool;
            let nameRu = '', nameKk = '';
            
            if (type === 'task') {
                nameRu = 'Новая задача'; nameKk = 'Жаңа тапсырма';
            } else if (type === 'gateway') {
                nameRu = 'Новый шлюз'; nameKk = 'Жаңа шлюз';
            } else {
                nameRu = 'Внешний запрос'; nameKk = 'Сыртқы сұраныс';
            }

            const node = {
                id: newNodeId,
                type,
                nameRu,
                nameKk,
                x: Math.round(coords.x),
                y: Math.round(coords.y)
            };

            if (type === 'task' || type === 'external') {
                node.roleId = 'role_initiator';
                node.sla = 24;
            } else if (type === 'gateway') {
                node.condition = 'budget > 1000000';
                node.targetYes = '';
                node.targetNo = '';
            }

            activeTemplate.nodes.push(node);
            renderCanvas();
            selectNode(node);
            
            // Reset tool to select
            resetTool();
        }
    } else if (currentTool === 'delete') {
        if (target) {
            const nodeId = target.dataset.id;
            deleteNode(nodeId);
        } else if (pathTarget) {
            deleteConnection(pathTarget.dataset.from, pathTarget.dataset.to);
        }
        resetTool();
    }
}

function onCanvasMouseMove(e) {
    if (isPanning) {
        const dx = e.clientX - startClientX;
        const dy = e.clientY - startClientY;
        panX = startPanX - dx * zoom;
        panY = startPanY - dy * zoom;
        updateViewBox();
        return;
    }

    const coords = getCanvasCoords(e);

    if (isDragging && dragNode) {
        dragNode.x = Math.round(coords.x - dragOffset.x);
        dragNode.y = Math.round(coords.y - dragOffset.y);
        renderCanvas();
    } else if (connectStartNode && tempLine) {
        tempLine.setAttribute('x2', coords.x);
        tempLine.setAttribute('y2', coords.y);
    }
}

function onCanvasMouseUp(e) {
    if (isPanning) {
        isPanning = false;
        canvasWrapper.style.cursor = 'grab';
        return;
    }
    if (isDragging) {
        isDragging = false;
        dragNode = null;
    } else if (connectStartNode && tempLine) {
        // Connect to target node if dropped on one
        const target = e.target.closest('.bpmn-node');
        if (target) {
            const targetId = target.dataset.id;
            
            if (targetId !== connectStartNode.id) {
                // Ensure duplicate connections don't exist
                const exists = activeTemplate.connections.some(c => c.from === connectStartNode.id && c.to === targetId);
                if (!exists) {
                    activeTemplate.connections.push({
                        from: connectStartNode.id,
                        to: targetId
                    });
                    
                    // If connecting from a gateway, automatically assign Yes/No targets
                    if (connectStartNode.type === 'gateway') {
                        if (!connectStartNode.targetYes) {
                            connectStartNode.targetYes = targetId;
                        } else if (!connectStartNode.targetNo) {
                            connectStartNode.targetNo = targetId;
                        }
                    }
                }
            }
        }
        
        svgCanvas.removeChild(tempLine);
        tempLine = null;
        connectStartNode = null;
        renderCanvas();
        resetTool();
    }
}

function onCanvasWheel(e) {
    e.preventDefault();
    const rect = svgCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = 1.15;
    let newZoom = zoom;
    if (e.deltaY < 0) {
        newZoom = Math.max(0.3, zoom / zoomFactor);
    } else {
        newZoom = Math.min(3.0, zoom * zoomFactor);
    }

    panX = panX + mouseX * (zoom - newZoom);
    panY = panY + mouseY * (zoom - newZoom);
    zoom = newZoom;

    updateViewBox();
}

function getCanvasCoords(e) {
    const rect = svgCanvas.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    return {
        x: panX + localX * zoom,
        y: panY + localY * zoom
    };
}

function resetTool() {
    document.querySelectorAll('.modeler-tool').forEach(b => b.classList.remove('active'));
    document.getElementById('tool-select').classList.add('active');
    currentTool = 'select';
}

function selectNode(node) {
    clearSelection();
    selectedNode = node;
    
    // Highlight elements visually
    const el = document.getElementById(`dom-node-${node.id}`);
    if (el) el.classList.add('selected');
    
    showInspector(node);
}

function selectConnection(from, to) {
    clearSelection();
    selectedConnection = { from, to };
    
    const el = svgCanvas.querySelector(`path[data-from="${from}"][data-to="${to}"]`);
    if (el) {
        el.setAttribute('stroke', '#6366f1');
        el.setAttribute('stroke-width', '3');
        el.setAttribute('marker-end', 'url(#arrow-selected)');
    }

    // Inspector shows simple connection details
    inspectorEmpty.style.display = 'none';
    inspectorForm.style.display = 'block';
    
    inspectNodeId.value = '';
    inspectNodeName.value = `${from} → ${to}`;
    inspectNodeName.setAttribute('readonly', 'true');
    inspectRoleGroup.style.display = 'none';
    inspectSLAGroup.style.display = 'none';
    inspectGatewayGroup.style.display = 'none';
}

function deleteNode(nodeId) {
    // 1. Remove node
    const nodeIdx = activeTemplate.nodes.findIndex(n => n.id === nodeId);
    if (nodeIdx >= 0) activeTemplate.nodes.splice(nodeIdx, 1);

    // 2. Remove all connected paths
    activeTemplate.connections = activeTemplate.connections.filter(c => c.from !== nodeId && c.to !== nodeId);

    // 3. Clear gateway targets references
    activeTemplate.nodes.forEach(n => {
        if (n.type === 'gateway') {
            if (n.targetYes === nodeId) n.targetYes = '';
            if (n.targetNo === nodeId) n.targetNo = '';
        }
    });

    clearSelection();
    renderCanvas();
}

function deleteConnection(from, to) {
    activeTemplate.connections = activeTemplate.connections.filter(c => !(c.from === from && c.to === to));
    
    // Clear gateway targets references if applicable
    const fromNode = activeTemplate.nodes.find(n => n.id === from);
    if (fromNode && fromNode.type === 'gateway') {
        if (fromNode.targetYes === to) fromNode.targetYes = '';
        if (fromNode.targetNo === to) fromNode.targetNo = '';
    }

    clearSelection();
    renderCanvas();
}

function showInspector(node) {
    inspectorEmpty.style.display = 'none';
    inspectorForm.style.display = 'block';

    inspectNodeId.value = node.id;
    inspectNodeName.value = currentLanguage === 'ru' ? node.nameRu : node.nameKk;
    inspectNodeName.removeAttribute('readonly');

    populateInspectorOptions();

    // Show/hide forms based on node types
    if (node.type === 'task' || node.type === 'external') {
        inspectRoleGroup.style.display = 'block';
        inspectSLAGroup.style.display = 'block';
        inspectGatewayGroup.style.display = 'none';
        
        inspectNodeRole.value = node.roleId || '';
        inspectNodeSLA.value = node.sla || 24;
    } else if (node.type === 'gateway') {
        inspectRoleGroup.style.display = 'none';
        inspectSLAGroup.style.display = 'none';
        inspectGatewayGroup.style.display = 'block';

        inspectGatewayCond.value = node.condition || '';
        inspectGatewayYes.value = node.targetYes || '';
        inspectGatewayNo.value = node.targetNo || '';
    } else {
        // Start or End Event properties
        inspectRoleGroup.style.display = 'none';
        inspectSLAGroup.style.display = 'none';
        inspectGatewayGroup.style.display = 'none';
    }
}

function populateInspectorOptions() {
    // Fill roles dropdown
    inspectNodeRole.innerHTML = '';
    db.roles.forEach(role => {
        inspectNodeRole.innerHTML += `<option value="${role.id}">${currentLanguage === 'ru' ? role.nameRu : role.nameKk}</option>`;
    });

    // Fill gateway choices dropdown (nodes target)
    if (selectedNode && selectedNode.type === 'gateway') {
        inspectGatewayYes.innerHTML = `<option value="">-- выбрать шаг --</option>`;
        inspectGatewayNo.innerHTML = `<option value="">-- выбрать шаг --</option>`;
        
        // Populate all connections pointing out of this gateway node
        const outgoing = activeTemplate.connections.filter(c => c.from === selectedNode.id);
        outgoing.forEach(conn => {
            const target = activeTemplate.nodes.find(n => n.id === conn.to);
            if (target) {
                const name = currentLanguage === 'ru' ? target.nameRu : target.nameKk;
                const opt = `<option value="${target.id}">${name}</option>`;
                inspectGatewayYes.innerHTML += opt;
                inspectGatewayNo.innerHTML += opt;
            }
        });
    }
}

function hideInspector() {
    inspectorEmpty.style.display = 'flex';
    inspectorForm.style.display = 'none';
}

function applyInspectorChanges() {
    if (!selectedNode) return;
    
    const newName = inspectNodeName.value.trim();
    if (newName === '') return;

    if (currentLanguage === 'ru') {
        selectedNode.nameRu = newName;
    } else {
        selectedNode.nameKk = newName;
    }

    if (selectedNode.type === 'task' || selectedNode.type === 'external') {
        selectedNode.roleId = inspectNodeRole.value;
        selectedNode.sla = parseInt(inspectNodeSLA.value) || 24;
    } else if (selectedNode.type === 'gateway') {
        selectedNode.condition = inspectGatewayCond.value.trim();
        selectedNode.targetYes = inspectGatewayYes.value;
        selectedNode.targetNo = inspectGatewayNo.value;
    }

    renderCanvas();
    
    const event = new CustomEvent('show-toast', {
        detail: {
            message: currentLanguage === 'ru' ? 'Параметры элемента применены' : 'Элемент параметрлері өзгертілді',
            type: 'info'
        }
    });
    window.dispatchEvent(event);
}

async function createNewTemplate() {
    const id = `proc_custom_${Date.now()}`;
    const title = currentLanguage === 'ru' ? 'Создание нового процесса' : 'Жаңа процесті құру';
    const label = currentLanguage === 'ru' ? 'Название процесса' : 'Процесс атауы';
    const defaultValue = currentLanguage === 'ru' ? 'Пользовательский процесс' : 'Пайдаланушылық процесс';
    const confirmBtnText = currentLanguage === 'ru' ? 'Добавить' : 'Қосу';

    const name = await customPrompt({
        title,
        label,
        defaultValue,
        confirmBtnText
    });
    if (!name) return;

    const newProc = {
        id,
        nameRu: name,
        nameKk: name,
        version: "1.0",
        nodes: [
            { id: "node_start", type: "start", nameRu: "Старт", nameKk: "Бастау", x: 50, y: 150 },
            { id: "node_end", type: "end", nameRu: "Конец", nameKk: "Соңы", x: 600, y: 150 }
        ],
        connections: []
    };

    db.templates.push(newProc);
    db.save();
    
    populateProcessList();
    processSelect.value = id;
    loadTemplate(id);
}

function saveActiveTemplate() {
    if (!activeTemplate) return;
    
    // Automatically recalculate / generate Role-Functional matrix rows for any new roles in process template
    activeTemplate.nodes.forEach(node => {
        if ((node.type === 'task' || node.type === 'external') && node.roleId) {
            // Insert matrix mapping if missing
            const exists = db.matrix.some(m => m.roleId === node.roleId && m.processId === activeTemplate.id);
            if (!exists) {
                const role = db.roles.find(r => r.id === node.roleId);
                const roleName = role ? role.nameRu : '';
                db.matrix.push({
                    roleId: node.roleId,
                    processId: activeTemplate.id,
                    function: `${currentLanguage === 'ru' ? 'Участник процесса' : 'Процеске қатысушы'} (BPM Modeler Autolink)`
                });
            }
        }
    });

    db.save();
    
    // Dispatch save visual updates toast
    const event = new CustomEvent('show-toast', {
        detail: {
            message: currentLanguage === 'ru' ? 'Процесс сохранен и связан с ролевой матрицей!' : 'Процесс сақталды және рольдік матрицамен байланыстырылды!',
            type: 'success'
        }
    });
    window.dispatchEvent(event);
}
