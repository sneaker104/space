// js/main.js

import { TILE_SIZE, BUILDINGS } from '../data/config.js';

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

// [신규/수정] 드래그 & 선 자르기 변수
let isLeftDown = false;
let draggedNode = null;
let isDraggingNode = false; // 클릭 vs 드래그 판별용
let dragOffset = { gridX: 0, gridY: 0 }; // 클릭한 블록 위치 보정용
let dragStartMousePos = { x: 0, y: 0 };
let swipeTrail = []; 

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

    // 만약 데이터가 문자열이면 배열로 변환 (호환성 유지)
    if (!Array.isArray(outType)) outType = [outType];
    if (!Array.isArray(inType)) inType = [inType];

    // 둘 중 하나라도 'all'을 포함하고 있으면 연결 허용
    if (outType.includes('all') || inType.includes('all')) return true;

    // 출발지의 아웃풋 중 하나라도 도착지의 인풋에 포함되는지(교집합) 확인
    return outType.some(resource => inType.includes(resource));
}

// [신규] 점과 선분 사이의 거리 계산 (정확한 선 자르기용)
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
    const zoomAmount = 0.1; const oldZoom = camera.zoom;
    if (e.deltaY < 0) camera.zoom = Math.min(camera.zoom + zoomAmount, 3);
    else camera.zoom = Math.max(camera.zoom - zoomAmount, 0.4);
    camera.x = e.clientX - (e.clientX - camera.x) * (camera.zoom / oldZoom);
    camera.y = e.clientY - (e.clientY - camera.y) * (camera.zoom / oldZoom);
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousedown', (e) => {
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
                // 노드 드래그 준비
                draggedNode = clickedNode;
                isDraggingNode = false;
                dragStartMousePos = { x: e.clientX, y: e.clientY };
                dragOffset = { gridX: gridX - clickedNode.x, gridY: gridY - clickedNode.y }; // 큰 기계 이동 보정
            } else {
                // 선 자르기 준비
                swipeTrail = [worldPos];
            }
        }
    }
});

window.addEventListener('mousemove', (e) => {
    if (isRightDragging) {
        camera.x += (e.clientX - lastMouse.x); camera.y += (e.clientY - lastMouse.y);
        lastMouse = { x: e.clientX, y: e.clientY };
        return;
    }

    if (isLeftDown) {
        const worldPos = screenToWorld(e.clientX, e.clientY);

        if (draggedNode) {
            // 마우스를 5px 이상 움직이면 드래그로 판정
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

            // [수정] 마우스 궤적과 선 사이의 거리가 15픽셀 이내면 절단!
            links = links.filter(link => {
                const p1 = getPorts(link.from), p2 = getPorts(link.to);
                const dist = distToSegment(worldPos, {x: p1.outX, y: p1.outY}, {x: p2.inX, y: p2.inY});
                return dist > 15; // 거리가 멀면 유지, 가까우면(자르면) 삭제
            });
        }
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 2) isRightDragging = false;
    else if (e.button === 0) {
        isLeftDown = false;
        
        // 제자리 클릭인 경우 (연결)
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
        // 드래그가 끝난 경우
        else if (draggedNode && isDraggingNode) {
            selectedNode = null; 
        }
        
        draggedNode = null;
        swipeTrail = [];
    }
});

// ---------------------------------------------------
// 게임 루프 및 렌더링
// ---------------------------------------------------
const I18N = { 'all': '모든자원', 'copper': '구리', 'steel': '강철' }; // 한글 번역용 맵

let lastTick = Date.now();
function gameLoop() {
    const now = Date.now();
    
    if (now - lastTick > 1000) {
        nodes.forEach(n => { if (n.typeInfo.input === null && n.resources < n.typeInfo.maxCapacity) n.resources++; });
        links.forEach(link => {
            if (link.from.resources > 0 && link.to.resources < link.to.typeInfo.maxCapacity) {
                link.from.resources--; link.to.resources++;
            }
        });
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

    // 2. 노드(기계) 몸통 먼저 렌더링
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

    // 4. 선(링크) 렌더링 (★노드 몸통 위에 렌더링되어 가려지지 않음)
    links.forEach(link => {
        const p1 = getPorts(link.from), p2 = getPorts(link.to);
        ctx.beginPath(); ctx.moveTo(p1.outX, p1.outY); ctx.lineTo(p2.inX, p2.inY);
        // 선이 잘 보이도록 하얀색에 가까운 밝은 빛 추가
        ctx.shadowBlur = 8; ctx.shadowColor = 'white'; 
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; 
        ctx.lineWidth = 4; ctx.stroke();
        ctx.shadowBlur = 0; // 그림자 초기화
    });

    // 5. 노드 안의 텍스트 및 점(포트) 렌더링 (★선 위에 텍스트가 보이도록 제일 마지막에 렌더링)
nodes.forEach(n => {
        const ports = getPorts(n);
        ctx.fillStyle = '#2ecc71'; ctx.beginPath(); ctx.arc(ports.inX, ports.inY, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(ports.outX, ports.outY, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();

        let maxX = 0, maxY = 0;
        n.typeInfo.shape.forEach(b => { if(b.x > maxX) maxX = b.x; if(b.y > maxY) maxY = b.y; });
        const centerX = (n.x + maxX/2) * TILE_SIZE + (TILE_SIZE / 2);
        const centerY = (n.y + maxY/2) * TILE_SIZE + (TILE_SIZE / 2);

        // ==========================================
        // 여기서부터 교체된 부분입니다 (배열 지원 텍스트 포맷팅)
        // ==========================================
        const formatIO = (io) => {
            if (!io) return '없음';
            const arr = Array.isArray(io) ? io : [io];
            return arr.map(res => I18N[res] || res).join(', '); // 여러 개면 쉼표로 연결
        };

        const inTxt = `IN: ${formatIO(n.typeInfo.input)}`;
        const outTxt = `OUT: ${formatIO(n.typeInfo.output)}`;

        ctx.fillStyle = 'white'; ctx.textAlign = 'center';
        ctx.font = 'bold 12px Arial'; ctx.fillText(n.typeInfo.name, centerX, centerY - 15);
        ctx.font = '14px Arial'; ctx.fillText(`${n.resources} / ${n.typeInfo.maxCapacity}`, centerX, centerY + 5);
        
        ctx.font = '10px Arial'; ctx.fillStyle = '#bdc3c7';
        ctx.fillText(inTxt, centerX, centerY + 20);
        ctx.fillText(outTxt, centerX, centerY + 32);
        // ==========================================
    });

    ctx.restore();
    requestAnimationFrame(gameLoop);
}

gameLoop();