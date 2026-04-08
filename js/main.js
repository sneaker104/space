// js/main.js

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
// 세이브 & 로드 로직 (currentResource 속성 추가)
// ---------------------------------------------------
function saveGame() {
    const saveData = {
        camera: camera,
        nodes: nodes.map(n => ({ 
            id: n.id, x: n.x, y: n.y, 
            typeId: n.typeInfo.id, 
            resources: n.resources,
            currentResource: n.currentResource // ★ 어떤 자원을 들고 있는지 저장
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
                currentResource: n.currentResource || null // ★ 복구
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
// ★ [신규] 1. 상단 UI 업데이트 함수 (창고 자원만 계산)
// ---------------------------------------------------
function updateResourceUI() {
    const owned = {};
    // 창고(storage)이고, 자원이 1개 이상 들어있는 것들만 필터링
    nodes.filter(n => n.typeInfo.id === 'storage').forEach(n => {
        if (n.resources > 0 && n.currentResource) {
            owned[n.currentResource] = (owned[n.currentResource] || 0) + n.resources;
        }
    });

    const bar = document.getElementById('resource-bar');
    if (Object.keys(owned).length === 0) {
        bar.innerHTML = '보유 자원: 0';
    } else {
        const html = Object.entries(owned).map(([res, count]) => {
            return `<span>📦 ${I18N[res] || res}: ${count}</span>`;
        }).join(' | ');
        bar.innerHTML = html;
    }
}

// ---------------------------------------------------
// ★ [신규] 4. 자원 소모 함수 (가장 오래된 창고부터 우선 사용)
// ---------------------------------------------------
// 나중에 기계를 건설할 때 이 함수를 호출하시면 됩니다. 예: consumeResource('copper', 10)
export function consumeResource(resourceType, amount) {
    // 1. 창고에 있는 해당 자원의 총합을 구함
    const total = nodes.filter(n => n.typeInfo.id === 'storage' && n.currentResource === resourceType)
                       .reduce((sum, n) => sum + n.resources, 0);
    
    // 2. 자원이 부족하면 거절(false)
    if (total < amount) return false;

    // 3. 자원이 충분하면, 창고들을 생성 시간(id)이 빠른 순서(오래된 순)로 정렬
    let remainingToConsume = amount;
    const storages = nodes.filter(n => n.typeInfo.id === 'storage' && n.currentResource === resourceType)
                          .sort((a, b) => a.id - b.id);

    // 4. 순서대로 차감
    for (let s of storages) {
        if (remainingToConsume <= 0) break;
        
        if (s.resources >= remainingToConsume) {
            s.resources -= remainingToConsume;
            remainingToConsume = 0;
        } else {
            remainingToConsume -= s.resources;
            s.resources = 0;
        }
        
        // 창고가 비워지면 다른 자원을 받을 수 있도록 초기화
        if (s.resources === 0) s.currentResource = null;
    }
    
    updateResourceUI(); // 소모 후 즉시 UI 갱신
    return true; // 성공적으로 소모됨
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
// 헬퍼 함수
// ---------------------------------------------------
function screenToWorld(screenX, screenY) { return { x: (screenX - camera.x) / camera.zoom, y: (screenY - camera.y) / camera.zoom }; }
function getBuildingAt(gx, gy) { return nodes.find(n => n.typeInfo.shape.some(block => (n.x + block.x) === gx && (n.y + block.y) === gy)); }
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
            let canBuild = true;
            typeInfo.shape.forEach(block => { if (getBuildingAt(gridX + block.x, gridY + block.y)) canBuild = false; });
            if (canBuild) {
                // 노드 생성 시 currentResource 초기화
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
                let canMove = true;
                draggedNode.typeInfo.shape.forEach(b => {
                    const existing = getBuildingAt(targetGridX + b.x, targetGridY + b.y);
                    if (existing && existing !== draggedNode) canMove = false;
                });
                if (canMove) { draggedNode.x = targetGridX; draggedNode.y = targetGridY; }
            }
        } 
        else if (swipeTrail.length > 0) {
            swipeTrail.push(worldPos);
            if (swipeTrail.length > 15) swipeTrail.shift();
            links = links.filter(link => {
                const p1 = getPorts(link.from), p2 = getPorts(link.to);
                return distToSegment(worldPos, {x: p1.outX, y: p1.outY}, {x: p2.inX, y: p2.inY}) > 15; 
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
        // 1. 자원 생산
        nodes.forEach(n => { 
            if (n.typeInfo.input === null && n.resources < n.typeInfo.maxCapacity) {
                n.resources++;
                // 채굴기: 자신이 생산하는 자원의 종류를 고정
                if (!n.currentResource) {
                    n.currentResource = Array.isArray(n.typeInfo.output) ? n.typeInfo.output[0] : n.typeInfo.output;
                }
            } 
        });

        // ★ 3. 섞임 방지 자원 이동 로직
        links.forEach(link => {
            if (link.from.resources > 0 && link.to.resources < link.to.typeInfo.maxCapacity) {
                const resToMove = link.from.currentResource;
                let canMove = true;

                // [핵심] 받는 쪽에 이미 자원이 1개 이상 있는데, 들어오려는 자원과 종류가 다르다면 섞임 방지!
                if (link.to.resources > 0 && link.to.currentResource !== resToMove) {
                    canMove = false; 
                }

                if (canMove) {
                    link.from.resources--;
                    // 보내는 쪽(창고)이 비워지면 자원 종류를 null로 초기화 (새로운 자원을 받을 수 있게)
                    if (link.from.resources === 0 && link.from.typeInfo.id === 'storage') {
                        link.from.currentResource = null;
                    }

                    link.to.resources++;
                    link.to.currentResource = resToMove; // 받는 쪽에 자원 종류 각인
                }
            }
        });
        
        updateResourceUI(); // 자원 변동이 있었으니 상단 UI 갱신
        saveGame(); 
        lastTick = now;
    }

    // 렌더링 시작
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
        ctx.beginPath(); ctx.moveTo(p1.outX, p1.outY); ctx.lineTo(p2.inX, p2.inY);
        ctx.shadowBlur = 8; ctx.shadowColor = 'white'; 
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; 
        ctx.lineWidth = 4; ctx.stroke();
        ctx.shadowBlur = 0; 
    });

    nodes.forEach(n => {
        const ports = getPorts(n);
        ctx.fillStyle = '#2ecc71'; ctx.beginPath(); ctx.arc(ports.inX, ports.inY, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(ports.outX, ports.outY, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();

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

        // ★ 기계 내부에 현재 어떤 자원(currentResource)이 들었는지 표기
        const resName = n.currentResource ? (I18N[n.currentResource] || n.currentResource) : '';

        ctx.fillStyle = 'white'; ctx.textAlign = 'center';
        ctx.font = 'bold 12px Arial'; ctx.fillText(n.typeInfo.name, centerX, centerY - 15);
        
        // "구리 10 / 1000" 형태로 출력
        ctx.font = '14px Arial'; ctx.fillText(`${resName} ${n.resources} / ${n.typeInfo.maxCapacity}`, centerX, centerY + 5);
        
        ctx.font = '10px Arial'; ctx.fillStyle = '#bdc3c7';
        ctx.fillText(inTxt, centerX, centerY + 20);
        ctx.fillText(outTxt, centerX, centerY + 32);
    });

    ctx.restore();
    requestAnimationFrame(gameLoop);
}

gameLoop();