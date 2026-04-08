// js/main.js

import { TILE_SIZE, BUILDINGS } from '../data/config.js';
import { I18N } from '../data/i18n.js'; // 분리된 번역 데이터 불러오기

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

// 세이브 저장을 위한 고유 키
const SAVE_KEY = 'spaceFactorySaveData';

// ---------------------------------------------------
// [신규] 세이브 & 로드 핵심 로직
// ---------------------------------------------------
function saveGame() {
    const saveData = {
        camera: camera,
        nodes: nodes.map(n => ({ id: n.id, x: n.x, y: n.y, typeId: n.typeInfo.id, resources: n.resources })),
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
                id: n.id, x: n.x, y: n.y, typeInfo: BUILDINGS[n.typeId], resources: n.resources || 0
            })).filter(n => n.typeInfo);
            
            links = [];
            saveData.links.forEach(l => {
                const fromNode = nodes.find(n => n.id === l.fromId);
                const toNode = nodes.find(n => n.id === l.toId);
                if (fromNode && toNode) links.push({ from: fromNode, to: toNode });
            });
        } catch (e) {
            console.error("세이브 로드 오류:", e);
        }
    }
}

// ---------------------------------------------------
// [신규] 설정 창 및 TXT 추출/붙여넣기 UI 이벤트
// ---------------------------------------------------
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeModalBtn = document.getElementById('close-modal-btn');

// 1. 모달 열기/닫기
if (settingsBtn) settingsBtn.addEventListener('click', () => { settingsModal.style.display = 'flex'; });
if (closeModalBtn) closeModalBtn.addEventListener('click', () => { settingsModal.style.display = 'none'; });

// 2. TXT로 내보내기 (Export)
const exportBtn = document.getElementById('export-btn');
if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        saveGame(); // 최신 상태 저장
        const savedStr = localStorage.getItem(SAVE_KEY);
        if (!savedStr) return alert("저장할 데이터가 없습니다.");

        const blob = new Blob([savedStr], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "space_factory_save.txt"; // 다운로드될 파일명
        a.click();
        URL.revokeObjectURL(url);
    });
}

// 3. 텍스트로 로드하기 (Import)
const importBtn = document.getElementById('import-btn');
if (importBtn) {
    importBtn.addEventListener('click', () => {
        const importStr = document.getElementById('import-text').value.trim();
        if (!importStr) return alert("텍스트를 입력해 주세요.");

        try {
            JSON.parse(importStr); // 유효한 데이터인지 검사
            localStorage.setItem(SAVE_KEY, importStr); // 강제 덮어쓰기
            alert("성공적으로 데이터를 로드했습니다! 화면을 새로고침합니다.");
            location.reload(); // 강제 새로고침하여 적용
        } catch (e) {
            alert("잘못된 형식의 텍스트입니다. 복사한 내용을 다시 확인해주세요.");
        }
    });
}

// 4. 데이터 초기화
const resetBtn = document.getElementById('reset-btn');
if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        if (confirm("정말 모든 세이브 데이터를 지우고 처음부터 다시 시작하시겠습니까?")) {
            localStorage.removeItem(SAVE_KEY);
            location.reload(); 
        }
    });
}

// ---------------------------------------------------
// UI 생성
// ---------------------------------------------------
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
function screenToWorld(screenX, screenY) {
    return { x: (screenX - camera.x) / camera.zoom, y: (screenY - camera.y) / camera.zoom };
}
function getBuildingAt(gx, gy) {
    return nodes.find(n => n.typeInfo.shape.some(block => (n.x + block.x) === gx && (n.y + block.y) === gy));
}
function getPorts(n) {
    const first = n.typeInfo.shape[0];
    const last = n.typeInfo.shape[n.typeInfo.shape.length - 1];
    return {
        inX: (n.x + first.x) * TILE_SIZE, inY: (n.y + first.y) * TILE_SIZE + (TILE_SIZE / 2),
        outX: (n.x + last.x) * TILE_SIZE + TILE_SIZE, outY: (n.y + last.y) * TILE_SIZE + (TILE_SIZE / 2)
    };
}
function canConnect(nodeA, nodeB) {
    let outType = nodeA.typeInfo.output;
    let inType = nodeB.typeInfo.input;
    if (!outType || !inType) return false;
    if (!Array.isArray(outType)) outType = [outType];
    if (!Array.isArray(inType)) inType = [inType];
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
// 마우스 이벤트 로직
// ---------------------------------------------------
canvas.addEventListener('wheel', (e) => {
    if (settingsModal && settingsModal.style.display === 'flex') return; // 모달 창 열려있으면 동작 방지

    const zoomAmount = 0.1; const oldZoom = camera.zoom;
    if (e.deltaY < 0) camera.zoom = Math.min(camera.zoom + zoomAmount, 3);
    else camera.zoom = Math.max(camera.zoom - zoomAmount, 0.4);
    camera.x = e.clientX - (e.clientX - camera.x) * (camera.zoom / oldZoom);
    camera.y = e.clientY - (e.clientY - camera.y) * (camera.zoom / oldZoom);
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousedown', (e) => {
    if (settingsModal && settingsModal.style.display === 'flex') return; // 모달 창 열려있으면 동작 방지

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
                nodes.push({ id: Date.now(), x: gridX, y: gridY, typeInfo: typeInfo, resources: 0 });
                currentBuildMode = null; 
                document.querySelectorAll('.build-item').forEach(el => el.classList.remove('active'));
            }
        } else {
            const clickedNode = getBuildingAt(gridX, gridY);
            if (clickedNode) {
                draggedNode = clickedNode; isDraggingNode = false;
                dragStartMousePos = { x: e.clientX, y: e.clientY };
                dragOffset = { gridX: gridX - clickedNode.x, gridY: gridY - clickedNode.y }; 
            } else {
                swipeTrail = [worldPos];
            }
        }
    }
});

window.addEventListener('mousemove', (e) => {
    if (settingsModal && settingsModal.style.display === 'flex') return; // 모달 창 열려있으면 동작 방지

    if (isRightDragging) {
        camera.x += (e.clientX - lastMouse.x); camera.y += (e.clientY - lastMouse.y);
        lastMouse = { x: e.clientX, y: e.clientY };
        return;
    }

    if (isLeftDown) {
        const worldPos = screenToWorld(e.clientX, e.clientY);

        if (draggedNode) {
            if (!isDraggingNode && Math.hypot(e.clientX - dragStartMousePos.x, e.clientY - dragStartMousePos.y) > 5) {
                isDraggingNode = true;
            }

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
                const dist = distToSegment(worldPos, {x: p1.outX, y: p1.outY}, {x: p2.inX, y: p2.inY});
                return dist > 15; 
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
        } 
        else if (draggedNode && isDraggingNode) {
            selectedNode = null; 
        }
        draggedNode = null;
        swipeTrail = [];
    }
});

// ---------------------------------------------------
// 게임 시작 (저장된 데이터 불러오기)
// ---------------------------------------------------
loadGame();

// ---------------------------------------------------
// 게임 루프 및 렌더링
// ---------------------------------------------------
let lastTick = Date.now();
function gameLoop() {
    const now = Date.now();
    
    // 1초마다 자원 증가 및 자동 저장
    if (now - lastTick > 1000) {
        nodes.forEach(n => { if (n.typeInfo.input === null && n.resources < n.typeInfo.maxCapacity) n.resources++; });
        links.forEach(link => {
            if (link.from.resources > 0 && link.to.resources < link.to.typeInfo.maxCapacity) {
                link.from.resources--; link.to.resources++;
            }
        });
        saveGame(); // ★ 주기적으로 자동 저장
        lastTick = now;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.translate(camera.x, camera.y); ctx.scale(camera.zoom, camera.zoom);

    // 1. 격자 렌더링
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; ctx.lineWidth = 1 / camera.zoom;
    const startX = Math.floor(-camera.x / camera.zoom / TILE_SIZE) * TILE_SIZE;
    const startY = Math.floor(-camera.y / camera.zoom / TILE_SIZE) * TILE_SIZE;
    const endX = startX + (canvas.width / camera.zoom) + TILE_SIZE;
    const endY = startY + (canvas.height / camera.zoom) + TILE_SIZE;
    for(let x = startX; x < endX; x += TILE_SIZE) { ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke(); }
    for(let y = startY; y < endY; y += TILE_SIZE) { ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke(); }

    // 2. 노드 몸통 렌더링
    nodes.forEach(n => {
        n.typeInfo.shape.forEach(block => {
            const px = (n.x + block.x) * TILE_SIZE, py = (n.y + block.y) * TILE_SIZE;
            ctx.fillStyle = n.typeInfo.color; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = (selectedNode === n || draggedNode === n) ? '#f1c40f' : '#2c3e50'; 
            ctx.lineWidth = (selectedNode === n || draggedNode === n) ? 3 : 1;
            ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        });
    });

    // 3. 자르기 궤적 렌더링
    if (swipeTrail.length > 1) {
        ctx.beginPath(); ctx.moveTo(swipeTrail[0].x, swipeTrail[0].y);
        for (let i = 1; i < swipeTrail.length; i++) ctx.lineTo(swipeTrail[i].x, swipeTrail[i].y);
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.8)'; ctx.lineWidth = 4 / camera.zoom; ctx.lineCap = 'round'; ctx.stroke();
    }

    // 4. 선 렌더링
    links.forEach(link => {
        const p1 = getPorts(link.from), p2 = getPorts(link.to);
        ctx.beginPath(); ctx.moveTo(p1.outX, p1.outY); ctx.lineTo(p2.inX, p2.inY);
        ctx.shadowBlur = 8; ctx.shadowColor = 'white'; 
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; 
        ctx.lineWidth = 4; ctx.stroke();
        ctx.shadowBlur = 0; 
    });

    // 5. 텍스트 및 포트 렌더링
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

        ctx.fillStyle = 'white'; ctx.textAlign = 'center';
        ctx.font = 'bold 12px Arial'; ctx.fillText(n.typeInfo.name, centerX, centerY - 15);
        ctx.font = '14px Arial'; ctx.fillText(`${n.resources} / ${n.typeInfo.maxCapacity}`, centerX, centerY + 5);
        
        ctx.font = '10px Arial'; ctx.fillStyle = '#bdc3c7';
        ctx.fillText(inTxt, centerX, centerY + 20);
        ctx.fillText(outTxt, centerX, centerY + 32);
    });

    ctx.restore();
    requestAnimationFrame(gameLoop);
}

gameLoop();