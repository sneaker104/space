// js/main.js
console.log("🚀 게임 스크립트가 정상적으로 로드되었습니다!");

import { TILE_SIZE, BUILDINGS, UPGRADES, INITIAL_UNLOCKED, TRANSFER_RATE } from '../data/config.js';
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
let purchasedUpgrades = []; // 구매한 업그레이드 목록

let isLeftDown = false;
let draggedNode = null;
let isDraggingNode = false; 
let dragOffset = { gridX: 0, gridY: 0 }; 
let dragStartMousePos = { x: 0, y: 0 };
let swipeTrail = []; 

const SAVE_KEY = 'spaceFactorySaveData';

// ---------------------------------------------------
// 세이브 & 로드 
// ---------------------------------------------------
function saveGame() {
    const saveData = {
        camera: camera,
        purchasedUpgrades: purchasedUpgrades,
        nodes: nodes.map(n => ({ id: n.id, x: n.x, y: n.y, typeId: n.typeInfo.id, inventory: n.inventory })),
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
            if (saveData.purchasedUpgrades) purchasedUpgrades = saveData.purchasedUpgrades;
            
            nodes = saveData.nodes.map(n => ({
                id: n.id, x: n.x, y: n.y, typeInfo: BUILDINGS[n.typeId], inventory: n.inventory || {}
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
// 자원 UI & 소모 시스템
// ---------------------------------------------------
function updateResourceUI() {
    const owned = {};
    nodes.filter(n => n.typeInfo.id === 'storage').forEach(n => {
        Object.keys(n.inventory).forEach(res => {
            if (n.inventory[res] >= 1) owned[res] = (owned[res] || 0) + n.inventory[res];
        });
    });

    const bar = document.getElementById('resource-bar');
    if (Object.keys(owned).length === 0) bar.innerHTML = '보유 자원: 0';
    else bar.innerHTML = Object.entries(owned).map(([res, count]) => `<span>📦 ${I18N[res] || res}: ${Math.floor(count)}</span>`).join(' | ');
}

// 자원 소모 함수 (비용 객체를 통째로 받음)
export function consumeResource(costs) {
    // 1. 자원이 모두 충분한지 검사
    for (let res in costs) {
        let total = nodes.filter(n => n.typeInfo.id === 'storage').reduce((sum, n) => sum + (n.inventory[res] || 0), 0);
        if (total < costs[res]) return false;
    }
    // 2. 가장 오래된 창고부터 차감
    for (let res in costs) {
        let remaining = costs[res];
        const storages = nodes.filter(n => n.typeInfo.id === 'storage' && (n.inventory[res] || 0) > 0).sort((a, b) => a.id - b.id);
        for (let s of storages) {
            if (remaining <= 0) break;
            if (s.inventory[res] >= remaining) {
                s.inventory[res] -= remaining; remaining = 0;
            } else {
                remaining -= s.inventory[res]; s.inventory[res] = 0;
            }
            if (s.inventory[res] <= 0) delete s.inventory[res];
        }
    }
    updateResourceUI(); 
    return true; 
}

// ---------------------------------------------------
// UI 및 모달 이벤트
// ---------------------------------------------------
const settingsModal = document.getElementById('settings-modal');
const upgradesModal = document.getElementById('upgrades-modal');

document.getElementById('settings-btn').addEventListener('click', () => { settingsModal.style.display = 'flex'; });
document.getElementById('upgrades-btn').addEventListener('click', () => { renderUpgrades(); upgradesModal.style.display = 'flex'; });

document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.target.closest('.modal').style.display = 'none'; });
});

document.getElementById('export-btn').addEventListener('click', () => {
    saveGame();
    const savedStr = localStorage.getItem(SAVE_KEY);
    if (!savedStr) return alert("데이터 없음");
    const blob = new Blob([savedStr], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = "space_factory_save.txt"; a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('import-btn').addEventListener('click', () => {
    const importStr = document.getElementById('import-text').value.trim();
    if (!importStr) return alert("텍스트 입력 요망");
    try { JSON.parse(importStr); localStorage.setItem(SAVE_KEY, importStr); alert("로드 성공!"); location.reload(); } catch (e) { alert("잘못된 형식"); }
});

document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm("초기화 하시겠습니까?")) { localStorage.removeItem(SAVE_KEY); location.reload(); }
});

document.getElementById('toggle-btn').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
    document.getElementById('toggle-btn').innerText = sidebar.classList.contains('open') ? '건설 메뉴 닫기 ▶' : '건설 메뉴 ◀';
});

// 건설 메뉴 렌더링 (해금 상태 반영)
function renderBuildMenu() {
    const menuContainer = document.getElementById('build-menu-container');
    menuContainer.innerHTML = '';
    
    // 기본 해금 건물 + 업그레이드로 해금된 건물 합치기
    let unlocked = [...INITIAL_UNLOCKED];
    purchasedUpgrades.forEach(upgId => { unlocked.push(...UPGRADES[upgId].unlocks); });

    unlocked.forEach(buildingId => {
        const b = BUILDINGS[buildingId];
        if (!b) return;
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
}

// 업그레이드 메뉴 렌더링
function renderUpgrades() {
    const list = document.getElementById('upgrades-list');
    list.innerHTML = '';
    Object.values(UPGRADES).forEach(upg => {
        const div = document.createElement('div');
        div.className = 'upgrade-item';
        const isPurchased = purchasedUpgrades.includes(upg.id);
        const costText = Object.entries(upg.cost).map(([k, v]) => `${I18N[k]||k} ${v}개`).join(', ');
        
        div.innerHTML = `
            <div><b>${upg.name}</b><br><small style="color:#bdc3c7">${upg.desc}</small><br><span style="color:#f39c12; font-size:12px;">비용: ${costText}</span></div>
            <button class="upgrade-btn" ${isPurchased ? 'disabled' : ''}>${isPurchased ? '완료' : '연구'}</button>
        `;
        if (!isPurchased) {
            div.querySelector('button').addEventListener('click', () => {
                if (consumeResource(upg.cost)) {
                    purchasedUpgrades.push(upg.id);
                    renderUpgrades(); renderBuildMenu(); saveGame();
                    alert(`${upg.name} 연구 완료! 새로운 건물이 건설 탭에 추가되었습니다.`);
                } else {
                    alert("창고에 자원이 부족합니다!");
                }
            });
        }
        list.appendChild(div);
    });
}

// ---------------------------------------------------
// 헬퍼 및 수학 함수
// ---------------------------------------------------
function screenToWorld(screenX, screenY) { return { x: (screenX - camera.x) / camera.zoom, y: (screenY - camera.y) / camera.zoom }; }
function getBuildingAt(gx, gy) { return nodes.find(n => n.typeInfo.shape.some(block => (n.x + block.x) === gx && (n.y + block.y) === gy)); }

function isValidPlacement(gridX, gridY, typeInfo, ignoredNode = null) {
    let isValid = true;
    typeInfo.shape.forEach(block => {
        const targetX = gridX + block.x; const targetY = gridY + block.y;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const existing = getBuildingAt(targetX + dx, targetY + dy);
                if (existing && existing !== ignoredNode) isValid = false;
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
    return outType.some(res => inType.includes(res));
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
    if (settingsModal.style.display === 'flex' || upgradesModal.style.display === 'flex') return;
    const zoomAmount = 0.1; const oldZoom = camera.zoom;
    if (e.deltaY < 0) camera.zoom = Math.min(camera.zoom + zoomAmount, 3);
    else camera.zoom = Math.max(camera.zoom - zoomAmount, 0.4);
    camera.x = e.clientX - (e.clientX - camera.x) * (camera.zoom / oldZoom);
    camera.y = e.clientY - (e.clientY - camera.y) * (camera.zoom / oldZoom);
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousedown', (e) => {
    if (settingsModal.style.display === 'flex' || upgradesModal.style.display === 'flex') return;
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
            if (isValidPlacement(gridX, gridY, typeInfo)) {
                nodes.push({ id: Date.now(), x: gridX, y: gridY, typeInfo: typeInfo, inventory: {} });
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
                if (isValidPlacement(targetGridX, targetGridY, draggedNode.typeInfo, draggedNode)) { 
                    draggedNode.x = targetGridX; draggedNode.y = targetGridY; 
                }
            }
        } 
        else if (swipeTrail.length > 0) {
            swipeTrail.push(worldPos);
            if (swipeTrail.length > 15) swipeTrail.shift();
            links = links.filter(link => {
                const p1 = getPorts(link.from), p2 = getPorts(link.to);
                const midX = (p1.outX + p2.inX) / 2;
                const d1 = distToSegment(worldPos, {x: p1.outX, y: p1.outY}, {x: midX, y: p1.outY});
                const d2 = distToSegment(worldPos, {x: midX, y: p1.outY}, {x: midX, y: p2.inY});
                const d3 = distToSegment(worldPos, {x: midX, y: p2.inY}, {x: p2.inX, y: p2.inY});
                return Math.min(d1, d2, d3) > 15; 
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

// 시작 초기화
loadGame();
renderBuildMenu();
updateResourceUI();

// ---------------------------------------------------
// 게임 루프 (Frame Time 기반)
// ---------------------------------------------------
let lastTime = performance.now();
let saveTimer = 0;

function gameLoop(time) {
    let deltaSec = (time - lastTime) / 1000;
    if (deltaSec > 0.5) deltaSec = 0.5; // 탭 이동 시 튐 방지
    lastTime = time;

    // 1. 노드 생산 (실수 기반 누적)
    nodes.forEach(n => {
        const type = n.typeInfo;
        let totalInv = Object.values(n.inventory).reduce((a,b)=>a+b, 0);
        if (totalInv >= type.maxCapacity) return; // 꽉 참

        if (type.input === null) {
            // 채굴기
            let outRes = Array.isArray(type.output) ? type.output[0] : type.output;
            n.inventory[outRes] = (n.inventory[outRes] || 0) + (type.generationPerSec * deltaSec);
        } else if (type.recipe) {
            // 공장 (다중 입력)
            let maxProd = type.generationPerSec * deltaSec;
            for (let reqRes in type.recipe) {
                // 가지고 있는 재료 비율에 맞춰 생산량 조절
                maxProd = Math.min(maxProd, (n.inventory[reqRes] || 0) / type.recipe[reqRes]);
            }
            if (maxProd > 0) {
                for (let reqRes in type.recipe) {
                    n.inventory[reqRes] -= type.recipe[reqRes] * maxProd;
                    if (n.inventory[reqRes] <= 0) delete n.inventory[reqRes];
                }
                let outRes = Array.isArray(type.output) ? type.output[0] : type.output;
                n.inventory[outRes] = (n.inventory[outRes] || 0) + maxProd;
            }
        }
    });

    // 2. 자원 이동 (초당 TRANSFER_RATE 만큼 부드럽게)
    links.forEach(link => {
        const from = link.from; const to = link.to;
        let availableRes = Object.keys(from.inventory).filter(k => from.inventory[k] > 0);
        if (availableRes.length === 0) return;
        
        let resToMove = availableRes[0]; // 이동할 자원 선택
        
        // 도착지 수용 규칙 검사
        let inType = to.typeInfo.input;
        if (!inType) return;
        if (!Array.isArray(inType)) inType = [inType];
        if (!inType.includes('all') && !inType.includes(resToMove)) return;

        // 창고 섞임 방지 규칙
        if (to.typeInfo.id === 'storage') {
            let existingRes = Object.keys(to.inventory).filter(k => to.inventory[k] > 0);
            if (existingRes.length > 0 && existingRes[0] !== resToMove) return;
        }

        let maxMove = TRANSFER_RATE * deltaSec; // 설정된 이동 속도
        let moveAmt = Math.min(maxMove, from.inventory[resToMove]);
        
        let toTotal = Object.values(to.inventory).reduce((a,b)=>a+b, 0);
        moveAmt = Math.min(moveAmt, to.typeInfo.maxCapacity - toTotal); // 빈공간 한계

        if (moveAmt > 0) {
            from.inventory[resToMove] -= moveAmt;
            to.inventory[resToMove] = (to.inventory[resToMove] || 0) + moveAmt;
            if (from.inventory[resToMove] <= 0) delete from.inventory[resToMove];
        }
    });

    updateResourceUI(); 

    // 자동 저장 (1초마다)
    saveTimer += deltaSec;
    if (saveTimer > 1) { saveGame(); saveTimer = 0; }

    // ---------------------------------------------------
    // 렌더링
    // ---------------------------------------------------
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

    links.forEach(link => {
        const p1 = getPorts(link.from), p2 = getPorts(link.to);
        const midX = (p1.outX + p2.inX) / 2;
        ctx.beginPath(); ctx.moveTo(p1.outX, p1.outY); ctx.lineTo(midX, p1.outY); ctx.lineTo(midX, p2.inY); ctx.lineTo(p2.inX, p2.inY);
        ctx.shadowBlur = 8; ctx.shadowColor = 'white'; ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; 
        ctx.lineWidth = 4; ctx.stroke(); ctx.shadowBlur = 0; 
    });

    nodes.forEach(n => {
        const ports = getPorts(n);
        ctx.fillStyle = '#2ecc71'; ctx.strokeStyle = '#1a252f'; ctx.lineWidth = 1;
        ctx.fillRect(ports.inX - 6, ports.inY - 6, 12, 12); ctx.strokeRect(ports.inX - 6, ports.inY - 6, 12, 12);
        ctx.fillStyle = '#e74c3c'; 
        ctx.fillRect(ports.outX - 6, ports.outY - 6, 12, 12); ctx.strokeRect(ports.outX - 6, ports.outY - 6, 12, 12);

        let maxX = 0, maxY = 0;
        n.typeInfo.shape.forEach(b => { if(b.x > maxX) maxX = b.x; if(b.y > maxY) maxY = b.y; });
        const centerX = (n.x + maxX/2) * TILE_SIZE + (TILE_SIZE / 2);
        const centerY = (n.y + maxY/2) * TILE_SIZE + (TILE_SIZE / 2);

        const formatIO = (io) => {
            if (!io) return '없음'; const arr = Array.isArray(io) ? io : [io];
            return arr.map(res => I18N[res] || res).join(', '); 
        };

        // 인벤토리 텍스트 생성 (돌: 10, 목재: 5)
        let totalInv = 0;
        const invKeys = Object.keys(n.inventory).filter(k => Math.floor(n.inventory[k]) > 0);
        const invText = invKeys.length > 0 
            ? invKeys.map(k => `${I18N[k]||k} ${Math.floor(n.inventory[k])}`).join(', ')
            : '비어있음';
        Object.values(n.inventory).forEach(v => totalInv += v);

        ctx.fillStyle = 'white'; ctx.textAlign = 'center';
        ctx.font = 'bold 12px Arial'; ctx.fillText(n.typeInfo.name, centerX, centerY - 15);
        ctx.font = '13px Arial'; ctx.fillText(invText, centerX, centerY + 3);
        ctx.font = '11px Arial'; ctx.fillText(`(${Math.floor(totalInv)} / ${n.typeInfo.maxCapacity})`, centerX, centerY + 16);
        ctx.font = '10px Arial'; ctx.fillStyle = '#bdc3c7';
        ctx.fillText(`IN: ${formatIO(n.typeInfo.input)}`, centerX, centerY + 30);
        ctx.fillText(`OUT: ${formatIO(n.typeInfo.output)}`, centerX, centerY + 42);
    });

    ctx.restore();
    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);