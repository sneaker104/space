// js/main.js
console.log("🚀 게임 스크립트가 정상적으로 로드되었습니다!");

import { TILE_SIZE, BUILDINGS } from '../data/config.js';
import { I18N } from '../data/i18n.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------
// 상태 변수
// ---------------------------------------------------
let camera = { x: 0, y: 0, zoom: 1 };
let isRightDragging = false;
let lastMouse = { x: 0, y: 0 };

let nodes = [];
let links = [];
let currentBuildMode = null;
let selectedNode = null;

let isLeftDown = false;
let draggedNode = null;
let isDraggingNode = false; 
let dragOffset = { gridX: 0, gridY: 0 }; 
let dragStartMousePos = { x: 0, y: 0 };
let swipeTrail = []; 

const SAVE_KEY = 'spaceFactorySaveData';

// ---------------------------------------------------
// 세이브 & 로드 로직 
// ---------------------------------------------------
function saveGame() {
    const saveData = {
        camera: camera,
        nodes: nodes.map(n => ({ 
            id: n.id, x: n.x, y: n.y, 
            typeId: n.typeInfo.id, 
            resources: n.resources,
            currentResource: n.currentResource
        })),
        links: links.map(l => ({ fromId: l.from.id, toId: l.to.id }))
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
}

function loadGame() {
    const savedStr = localStorage.getItem(SAVE_KEY);
    if (savedStr) {
        try {
            const saveData = JSON.parse(savedStr);
            if (saveData.camera) camera = saveData.camera;
            nodes = saveData.nodes.map(n => ({
                id: n.id, x: n.x, y: n.y, 
                typeInfo: BUILDINGS[n.typeId], 
                resources: n.resources || 0,
                currentResource: n.currentResource || null 
            })).filter(n => n.typeInfo);
            
            links = [];
            saveData.links.forEach(l => {
                const fromNode = nodes.find(n => n.id === l.fromId);
                const toNode = nodes.find(n => n.id === l.toId);
                if (fromNode && toNode) links.push({ from: fromNode, to: toNode });
            });
        } catch (e) { console.error("세이브 로드 오류:", e); }
    }
}

// ---------------------------------------------------
// 상단 UI 및 자원 소모 로직
// ---------------------------------------------------
function updateResourceUI() {
    const owned = {};
    nodes.filter(n => n.typeInfo.id === 'storage').forEach(n => {
        if (n.resources > 0 && n.currentResource) {
            owned[n.currentResource] = (owned[n.currentResource] || 0) + n.resources;
        }
    });

    const bar = document.getElementById('resource-bar');
    if (Object.keys(owned).length === 0) {
        bar.innerHTML = '보유 자원: 0';
    } else {
        bar.innerHTML = Object.entries(owned).map(([res, count]) => `<span>📦 ${I18N[res] || res}: ${count}</span>`).join(' | ');
    }
}

export function consumeResource(resourceType, amount) {
    const total = nodes.filter(n => n.typeInfo.id === 'storage' && n.currentResource === resourceType)
                       .reduce((sum, n) => sum + n.resources, 0);
    
    if (total < amount) return false;

    let remaining = amount;
    const storages = nodes.filter(n => n.typeInfo.id === 'storage' && n.currentResource === resourceType)
                          .sort((a, b) => a.id - b.id);

    for (let s of storages) {
        if (remaining <= 0) break;
        if (s.resources >= remaining) {
            s.resources -= remaining; remaining = 0;
        } else {
            remaining -= s.resources; s.resources = 0;
        }
        if (s.resources === 0) s.currentResource = null;
    }
    updateResourceUI(); 
    return true; 
}

// ---------------------------------------------------
// UI 및 설정 모달 이벤트
// ---------------------------------------------------
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeModalBtn = document.getElementById('close-modal-btn');

if (settingsBtn) settingsBtn.addEventListener('click', () => { settingsModal.style.display = 'flex'; });
if (closeModalBtn) closeModalBtn.addEventListener('click', () => { settingsModal.style.display = 'none'; });

const exportBtn = document.getElementById('export-btn');
if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        saveGame();
        const savedStr = localStorage.getItem(SAVE_KEY);
        if (!savedStr) return alert("데이터 없음");
        const blob = new Blob([savedStr], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = "space_factory_save.txt"; a.click();
        URL.revokeObjectURL(url);
    });
}

const importBtn = document.getElementById('import-btn');
if (importBtn) {
    importBtn.addEventListener('click', () => {
        const importStr = document.getElementById('import-text').value.trim();
        if (!importStr) return alert("텍스트 입력 요망");
        try {
            JSON.parse(importStr);
            localStorage.setItem(SAVE_KEY, importStr);
            alert("로드 성공!"); location.reload();
        } catch (e) { alert("잘못된 형식"); }
    });
}

const resetBtn = document.getElementById('reset-btn');
if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        if (confirm("초기화 하시겠습니까?")) { localStorage.removeItem(SAVE_KEY); location.reload(); }
    });
}

const menuContainer = document.getElementById('build-menu-container');
Object.values(BUILDINGS).forEach(b => {
    const btn = document.createElement('div');
    btn.className = 'build-item';
    let shapeText = b.shape.length > 1 ? `(${b.shape.length}칸)` : `(1칸)`;
    btn.innerHTML = `<div class="color-box" style="background-color:${b.color};"></div>
                     <div><b>${b.name}</b> <small>${shapeText}</small></div>`;
    btn.addEventListener('click', () => {
        document.querySelectorAll('.build-item').forEach(el => el.classList.remove('active'));
        if (currentBuildMode === b.id) currentBuildMode = null;
        else { btn.classList.add('active'); currentBuildMode = b.id; selectedNode = null; }
    });
    menuContainer.appendChild(btn);
});

document.getElementById('toggle-btn').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
    document.getElementById('toggle-btn').innerText = sidebar.classList.contains('open') ? '건설 메뉴 닫기 ▶' : '건설 메뉴 열기 ◀';
});

// ---------------------------------------------------
// 헬퍼 및 수학 함수
// ---------------------------------------------------
function screenToWorld(screenX, screenY) { return { x: (screenX - camera.x) / camera.zoom, y: (screenY - camera.y) / camera.zoom }; }
function getBuildingAt(gx, gy) { return nodes.find(n => n.typeInfo.shape.some(block => (n.x + block.x) === gx && (n.y + block.y) === gy)); }

// ★ [신규] 1칸 띄우기 (여백) 검사 함수
function isValidPlacement(gridX, gridY, typeInfo, ignoredNode = null) {
    let isValid = true;
    typeInfo.shape.forEach(block => {
        const targetX = gridX + block.x;
        const targetY = gridY + block.y;
        
        // 해당 칸과 주변 8칸 모두 검사 (건물이 맞닿지 않도록)
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const existing = getBuildingAt(targetX + dx, targetY + dy);
                if (existing && existing !== ignoredNode) {
                    isValid = false;
                }
            }
        }
    });
    return isValid;
}

function getPorts(n) {
    const first = n.typeInfo.shape[0]; const last = n.typeInfo.shape[n.typeInfo.shape.length - 1];
    return {
        inX: (n.x + first.x) * TILE_SIZE, inY: (n.y + first.y) * TILE_SIZE + (TILE_SIZE / 2),
        outX: (n.x + last.x) * TILE_SIZE + TILE_SIZE, outY: (n.y + last.y) * TILE_SIZE + (TILE_SIZE / 2)
    };
}

function canConnect(nodeA, nodeB) {
    let outType = nodeA.typeInfo.output; let inType = nodeB.typeInfo.input;
    if (!outType || !inType) return false;
    if (!Array.isArray(outType)) outType = [outType]; if (!Array.isArray(inType)) inType = [inType];
    if (outType.includes('all') || inType.includes('all')) return true;
    return outType.some(resource => inType.includes(resource));
}

function distToSegment(P, A, B) {
    const l2 = (B.x - A.x)**2 + (B.y - A.y)**2;
    if (l2 === 0) return Math.hypot(P.x - A.x, P.y - A.y);
    let t = ((P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const proj = { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) };
    return Math.hypot(P.x - proj.x, P.y - proj.y);
}

// ---------------------------------------------------
// 마우스 이벤트
// ---------------------------------------------------
canvas.addEventListener('wheel', (e) => {
    if (settingsModal && settingsModal.style.display === 'flex') return;
    const zoomAmount = 0.1; const oldZoom = camera.zoom;
    if (e.deltaY < 0) camera.zoom = Math.min(camera.zoom + zoomAmount, 3);
    else camera.zoom = Math.max(camera.zoom - zoomAmount, 0.4);
    camera.x = e.clientX - (e.clientX - camera.x) * (camera.zoom / oldZoom);
    camera.y = e.clientY - (e.clientY - camera.y) * (camera.zoom / oldZoom);
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousedown', (e) => {
    if (settingsModal && settingsModal.style.display === 'flex') return;
    if (e.button === 2) { 
        isRightDragging = true; lastMouse = { x: e.clientX, y: e.clientY }; 
    } 
    else if (e.button === 0) {
        isLeftDown = true;
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const gridX = Math.floor(worldPos.x / TILE_SIZE);
        const gridY = Math.floor(worldPos.y / TILE_SIZE);

        if (currentBuildMode) {
            const typeInfo = BUILDINGS[currentBuildMode];
            // ★ [수정] 1칸 띄우기 규칙 검사
            if (isValidPlacement(gridX, gridY, typeInfo)) {
                nodes.push({ id: Date.now(), x: gridX, y: gridY, typeInfo: typeInfo, resources: 0, currentResource: null });
                currentBuildMode = null; 
                document.querySelectorAll('.build-item').forEach(el => el.classList.remove('active'));
            }
        } else {
            const clickedNode = getBuildingAt(gridX, gridY);
            if (clickedNode) {
                draggedNode = clickedNode; isDraggingNode = false;
                dragStartMousePos = { x: e.clientX, y: e.clientY };
                dragOffset = { gridX: gridX - clickedNode.x, gridY: gridY - clickedNode.y }; 
            } else swipeTrail = [worldPos];
        }
    }
});

window.addEventListener('mousemove', (e) => {
    if (settingsModal && settingsModal.style.display === 'flex') return;
    if (isRightDragging) {
        camera.x += (e.clientX - lastMouse.x); camera.y += (e.clientY - lastMouse.y);
        lastMouse = { x: e.clientX, y: e.clientY }; return;
    }
    if (isLeftDown) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        if (draggedNode) {
            if (!isDraggingNode && Math.hypot(e.clientX - dragStartMousePos.x, e.clientY - dragStartMousePos.y) > 5) isDraggingNode = true;
            if (isDraggingNode) {
                const targetGridX = Math.floor(worldPos.x / TILE_SIZE) - dragOffset.gridX;
                const targetGridY = Math.floor(worldPos.y / TILE_SIZE) - dragOffset.gridY;
                
                // ★ [수정] 1칸 띄우기 규칙 검사 (드래그 이동 중)
                if (isValidPlacement(targetGridX, targetGridY, draggedNode.typeInfo, draggedNode)) { 
                    draggedNode.x = targetGridX; draggedNode.y = targetGridY; 
                }
            }
        } 
        else if (swipeTrail.length > 0) {
            swipeTrail.push(worldPos);
            if (swipeTrail.length > 15) swipeTrail.shift();
            
            // ★ [수정] 직각 선 자르기(스와이프) 충돌 로직 업데이트
            links = links.filter(link => {
                const p1 = getPorts(link.from), p2 = getPorts(link.to);
                const midX = (p1.outX + p2.inX) / 2;
                
                const d1 = distToSegment(worldPos, {x: p1.outX, y: p1.outY}, {x: midX, y: p1.outY});
                const d2 = distToSegment(worldPos, {x: midX, y: p1.outY}, {x: midX, y: p2.inY});
                const d3 = distToSegment(worldPos, {x: midX, y: p2.inY}, {x: p2.inX, y: p2.inY});
                
                return Math.min(d1, d2, d3) > 15; // 세 선분 중 하나라도 스치면 잘림
            });
        }
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 2) isRightDragging = false;
    else if (e.button === 0) {
        isLeftDown = false;
        if (draggedNode && !isDraggingNode) {
            if (!selectedNode) selectedNode = draggedNode;
            else {
                if (selectedNode !== draggedNode && canConnect(selectedNode, draggedNode)) {
                    const exists = links.some(l => l.from === selectedNode && l.to === draggedNode);
                    if (!exists) links.push({ from: selectedNode, to: draggedNode });
                }
                selectedNode = null; 
            }
        } else if (draggedNode && isDraggingNode) selectedNode = null; 
        draggedNode = null; swipeTrail = [];
    }
});

// 시작
loadGame();
let lastTick = Date.now();

// ---------------------------------------------------
// 게임 루프 및 렌더링
// ---------------------------------------------------
function gameLoop() {
    const now = Date.now();
    
    if (now - lastTick > 1000) {
        nodes.forEach(n => { 
            if (n.typeInfo.input === null && n.resources < n.typeInfo.maxCapacity) {
                n.resources++;
                if (!n.currentResource) n.currentResource = Array.isArray(n.typeInfo.output) ? n.typeInfo.output[0] : n.typeInfo.output;
            } 
        });

        links.forEach(link => {
            if (link.from.resources > 0 && link.to.resources < link.to.typeInfo.maxCapacity) {
                const resToMove = link.from.currentResource;
                let canMove = true;
                if (link.to.resources > 0 && link.to.currentResource !== resToMove) canMove = false; 

                if (canMove) {
                    link.from.resources--;
                    if (link.from.resources === 0 && link.from.typeInfo.id === 'storage') link.from.currentResource = null;
                    link.to.resources++; link.to.currentResource = resToMove; 
                }
            }
        });
        
        updateResourceUI(); 
        saveGame(); 
        lastTick = now;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.translate(camera.x, camera.y); ctx.scale(camera.zoom, camera.zoom);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; ctx.lineWidth = 1 / camera.zoom;
    const startX = Math.floor(-camera.x / camera.zoom / TILE_SIZE) * TILE_SIZE;
    const startY = Math.floor(-camera.y / camera.zoom / TILE_SIZE) * TILE_SIZE;
    const endX = startX + (canvas.width / camera.zoom) + TILE_SIZE;
    const endY = startY + (canvas.height / camera.zoom) + TILE_SIZE;
    for(let x = startX; x < endX; x += TILE_SIZE) { ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke(); }
    for(let y = startY; y < endY; y += TILE_SIZE) { ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke(); }

    nodes.forEach(n => {
        n.typeInfo.shape.forEach(block => {
            const px = (n.x + block.x) * TILE_SIZE, py = (n.y + block.y) * TILE_SIZE;
            ctx.fillStyle = n.typeInfo.color; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = (selectedNode === n || draggedNode === n) ? '#f1c40f' : '#2c3e50'; 
            ctx.lineWidth = (selectedNode === n || draggedNode === n) ? 3 : 1;
            ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        });
    });

    if (swipeTrail.length > 1) {
        ctx.beginPath(); ctx.moveTo(swipeTrail[0].x, swipeTrail[0].y);
        for (let i = 1; i < swipeTrail.length; i++) ctx.lineTo(swipeTrail[i].x, swipeTrail[i].y);
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.8)'; ctx.lineWidth = 4 / camera.zoom; ctx.lineCap = 'round'; ctx.stroke();
    }

    // ★ [수정] 선을 대각선이 아닌 직각(Orthogonal) 모양으로 그리기
    links.forEach(link => {
        const p1 = getPorts(link.from), p2 = getPorts(link.to);
        const midX = (p1.outX + p2.inX) / 2; // 선이 꺾이는 중간 지점

        ctx.beginPath(); 
        ctx.moveTo(p1.outX, p1.outY); 
        ctx.lineTo(midX, p1.outY);    // 오른쪽으로 직진
        ctx.lineTo(midX, p2.inY);     // 위아래로 꺾임
        ctx.lineTo(p2.inX, p2.inY);   // 다시 목표를 향해 직진
        
        ctx.shadowBlur = 8; ctx.shadowColor = 'white'; 
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; 
        ctx.lineWidth = 4; ctx.stroke();
        ctx.shadowBlur = 0; 
    });

    nodes.forEach(n => {
        const ports = getPorts(n);
        
        // ★ [수정] 포트를 동그라미에서 각진 사각형(Square)으로 변경
        ctx.fillStyle = '#2ecc71'; ctx.strokeStyle = '#1a252f'; ctx.lineWidth = 1;
        ctx.fillRect(ports.inX - 6, ports.inY - 6, 12, 12);
        ctx.strokeRect(ports.inX - 6, ports.inY - 6, 12, 12);
        
        ctx.fillStyle = '#e74c3c'; 
        ctx.fillRect(ports.outX - 6, ports.outY - 6, 12, 12);
        ctx.strokeRect(ports.outX - 6, ports.outY - 6, 12, 12);

        let maxX = 0, maxY = 0;
        n.typeInfo.shape.forEach(b => { if(b.x > maxX) maxX = b.x; if(b.y > maxY) maxY = b.y; });
        const centerX = (n.x + maxX/2) * TILE_SIZE + (TILE_SIZE / 2);
        const centerY = (n.y + maxY/2) * TILE_SIZE + (TILE_SIZE / 2);

        const formatIO = (io) => {
            if (!io) return '없음';
            const arr = Array.isArray(io) ? io : [io];
            return arr.map(res => I18N[res] || res).join(', '); 
        };

        const inTxt = `IN: ${formatIO(n.typeInfo.input)}`;
        const outTxt = `OUT: ${formatIO(n.typeInfo.output)}`;
        const resName = n.currentResource ? (I18N[n.currentResource] || n.currentResource) : '';

        ctx.fillStyle = 'white'; ctx.textAlign = 'center';
        ctx.font = 'bold 12px Arial'; ctx.fillText(n.typeInfo.name, centerX, centerY - 15);
        ctx.font = '14px Arial'; ctx.fillText(`${resName} ${n.resources} / ${n.typeInfo.maxCapacity}`, centerX, centerY + 5);
        ctx.font = '10px Arial'; ctx.fillStyle = '#bdc3c7';
        ctx.fillText(inTxt, centerX, centerY + 20);
        ctx.fillText(outTxt, centerX, centerY + 32);
    });

    ctx.restore();
    requestAnimationFrame(gameLoop);
}

gameLoop();