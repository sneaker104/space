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

// [신규] 드래그 & 선 자르기 관련 변수
let isLeftDown = false;
let draggedNode = null;
let dragStartMousePos = { x: 0, y: 0 };
let hasMovedDuringDrag = false;
let swipeTrail = []; // 선 자르기 궤적 저장

// ---------------------------------------------------
// UI 및 메뉴
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
        if (currentBuildMode === b.id) {
            currentBuildMode = null;
        } else {
            btn.classList.add('active');
            currentBuildMode = b.id;
            selectedNode = null; 
        }
    });
    menuContainer.appendChild(btn);
});

const toggleBtn = document.getElementById('toggle-btn');
const sidebar = document.getElementById('sidebar');
toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    toggleBtn.innerText = sidebar.classList.contains('open') ? '건설 메뉴 닫기 ▶' : '건설 메뉴 열기 ◀';
});

// ---------------------------------------------------
// 헬퍼 및 수학 연산 함수
// ---------------------------------------------------
function screenToWorld(screenX, screenY) {
    return { x: (screenX - camera.x) / camera.zoom, y: (screenY - camera.y) / camera.zoom };
}

function getBuildingAt(gx, gy) {
    return nodes.find(n => n.typeInfo.shape.some(block => (n.x + block.x) === gx && (n.y + block.y) === gy));
}

function getPorts(n) {
    const firstBlock = n.typeInfo.shape[0];
    const lastBlock = n.typeInfo.shape[n.typeInfo.shape.length - 1];
    return {
        inX: (n.x + firstBlock.x) * TILE_SIZE, inY: (n.y + firstBlock.y) * TILE_SIZE + (TILE_SIZE / 2),
        outX: (n.x + lastBlock.x) * TILE_SIZE + TILE_SIZE, outY: (n.y + lastBlock.y) * TILE_SIZE + (TILE_SIZE / 2)
    };
}

// [신규] 두 기계가 연결 가능한지 확인하는 함수
function canConnect(nodeA, nodeB) {
    const outType = nodeA.typeInfo.output;
    const inType = nodeB.typeInfo.input;
    // 출발지에 Output이 있고, 도착지에 Input이 있으며, 종류가 일치하거나 도착지가 'all'을 받을 수 있는 경우
    if (outType && inType && (inType === 'all' || inType === outType)) {
        return true;
    }
    return false;
}

// [신규] 두 선분(A-B, C-D)이 교차하는지 판별하는 수학 함수 (선 자르기용)
function ccw(A, B, C) { return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x); }
function segmentsIntersect(A, B, C, D) {
    return ccw(A, C, D) !== ccw(B, C, D) && ccw(A, B, C) !== ccw(A, B, D);
}

// ---------------------------------------------------
// 마우스 이벤트 (카메라, 이동, 건설, 자르기 통합)
// ---------------------------------------------------
canvas.addEventListener('wheel', (e) => {
    const zoomAmount = 0.1;
    const oldZoom = camera.zoom;
    if (e.deltaY < 0) camera.zoom = Math.min(camera.zoom + zoomAmount, 3);
    else camera.zoom = Math.max(camera.zoom - zoomAmount, 0.4);
    camera.x = e.clientX - (e.clientX - camera.x) * (camera.zoom / oldZoom);
    camera.y = e.clientY - (e.clientY - camera.y) * (camera.zoom / oldZoom);
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2) { // 우클릭 (카메라 이동)
        isRightDragging = true;
        lastMouse = { x: e.clientX, y: e.clientY };
    } 
    else if (e.button === 0) { // 좌클릭 (건설, 드래그, 자르기)
        isLeftDown = true;
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const gridX = Math.floor(worldPos.x / TILE_SIZE);
        const gridY = Math.floor(worldPos.y / TILE_SIZE);

        if (currentBuildMode) {
            // [건설 모드]
            const typeInfo = BUILDINGS[currentBuildMode];
            let canBuild = true;
            typeInfo.shape.forEach(block => {
                if (getBuildingAt(gridX + block.x, gridY + block.y)) canBuild = false;
            });
            if (canBuild) {
                nodes.push({ id: Date.now(), x: gridX, y: gridY, typeInfo: typeInfo, resources: 0 });
                currentBuildMode = null; 
                document.querySelectorAll('.build-item').forEach(el => el.classList.remove('active'));
            }
        } else {
            // [일반 모드]
            const clickedNode = getBuildingAt(gridX, gridY);
            if (clickedNode) {
                // 기계를 클릭한 경우 (드래그 준비)
                draggedNode = clickedNode;
                dragStartMousePos = { x: e.clientX, y: e.clientY };
                hasMovedDuringDrag = false;
            } else {
                // 빈 땅을 클릭한 경우 (선 자르기 궤적 시작)
                swipeTrail = [worldPos];
            }
        }
    }
});

window.addEventListener('mousemove', (e) => {
    // 카메라 우클릭 이동
    if (isRightDragging) {
        camera.x += (e.clientX - lastMouse.x);
        camera.y += (e.clientY - lastMouse.y);
        lastMouse = { x: e.clientX, y: e.clientY };
        return;
    }

    if (isLeftDown) {
        const worldPos = screenToWorld(e.clientX, e.clientY);

        if (draggedNode) {
            // 기계 드래그 중
            const dx = e.clientX - dragStartMousePos.x;
            const dy = e.clientY - dragStartMousePos.y;
            
            // 살짝만 움직인 것은 클릭으로 간주, 일정 거리 이상 움직이면 드래그로 판정
            if (Math.hypot(dx, dy) > 10) hasMovedDuringDrag = true;

            if (hasMovedDuringDrag) {
                const gridX = Math.floor(worldPos.x / TILE_SIZE);
                const gridY = Math.floor(worldPos.y / TILE_SIZE);

                // 이동할 위치에 다른 건물이 없는지 확인 (자기 자신은 제외)
                let canMove = true;
                draggedNode.typeInfo.shape.forEach(block => {
                    const existing = getBuildingAt(gridX + block.x, gridY + block.y);
                    if (existing && existing !== draggedNode) canMove = false;
                });

                if (canMove) {
                    draggedNode.x = gridX;
                    draggedNode.y = gridY;
                }
            }
        } 
        else if (swipeTrail.length > 0) {
            // 빈 땅에서 스와이프(드래그) 중 -> 선 자르기
            const lastPos = swipeTrail[swipeTrail.length - 1];
            swipeTrail.push(worldPos);

            // 궤적 길이를 15개로 유지 (꼬리가 사라지는 이펙트)
            if (swipeTrail.length > 15) swipeTrail.shift();

            // 지나간 궤적이 연결 선과 교차하는지 검사
            links = links.filter(link => {
                const p1 = getPorts(link.from), p2 = getPorts(link.to);
                const isCut = segmentsIntersect(
                    { x: p1.outX, y: p1.outY }, { x: p2.inX, y: p2.inY }, // 기존 연결 선
                    lastPos, worldPos // 마우스가 방금 지나간 선
                );
                return !isCut; // 교차(Cut)되었다면 배열에서 제거
            });
        }
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 2) isRightDragging = false;
    else if (e.button === 0) {
        isLeftDown = false;
        
        // 기계를 클릭하고 드래그하지 않고 마우스를 뗀 경우 = [기계 선택 / 선 연결]
        if (draggedNode && !hasMovedDuringDrag) {
            if (!selectedNode) {
                selectedNode = draggedNode;
            } else {
                if (selectedNode !== draggedNode) {
                    // [신규] 조건 검사 통과 시에만 연결
                    if (canConnect(selectedNode, draggedNode)) {
                        const exists = links.some(l => l.from === selectedNode && l.to === draggedNode);
                        if (!exists) links.push({ from: selectedNode, to: draggedNode });
                    }
                }
                selectedNode = null; 
            }
        } 
        // 드래그를 마친 경우
        else if (draggedNode && hasMovedDuringDrag) {
            selectedNode = null; // 드래그가 끝난 후 다른 선이 엉뚱하게 연결되는 것 방지
        }
        
        draggedNode = null;
        swipeTrail = []; // 자르기 궤적 초기화
    }
});

// ---------------------------------------------------
// 게임 루프 및 렌더링
// ---------------------------------------------------
let lastTick = Date.now();

function gameLoop() {
    const now = Date.now();
    
    if (now - lastTick > 1000) {
        nodes.forEach(n => {
            if (n.typeInfo.input === null && n.resources < n.typeInfo.maxCapacity) n.resources++;
        });
        links.forEach(link => {
            if (link.from.resources > 0 && link.to.resources < link.to.typeInfo.maxCapacity) {
                link.from.resources--; link.to.resources++;
            }
        });
        lastTick = now;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save(); 
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // 격자
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; 
    ctx.lineWidth = 1 / camera.zoom;
    const startX = Math.floor(-camera.x / camera.zoom / TILE_SIZE) * TILE_SIZE;
    const startY = Math.floor(-camera.y / camera.zoom / TILE_SIZE) * TILE_SIZE;
    const endX = startX + (canvas.width / camera.zoom) + TILE_SIZE;
    const endY = startY + (canvas.height / camera.zoom) + TILE_SIZE;
    for(let x = startX; x < endX; x += TILE_SIZE) { ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke(); }
    for(let y = startY; y < endY; y += TILE_SIZE) { ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke(); }

    // 자르기 궤적 그리기 (빨간 선 이펙트)
    if (swipeTrail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(swipeTrail[0].x, swipeTrail[0].y);
        for (let i = 1; i < swipeTrail.length; i++) ctx.lineTo(swipeTrail[i].x, swipeTrail[i].y);
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.8)';
        ctx.lineWidth = 4 / camera.zoom; // 줌 상태에 맞춰 굵기 조절
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }

    // 연결 선 그리기
    links.forEach(link => {
        const p1 = getPorts(link.from), p2 = getPorts(link.to);
        ctx.beginPath(); ctx.moveTo(p1.outX, p1.outY); ctx.lineTo(p2.inX, p2.inY);
        ctx.strokeStyle = 'rgba(236, 240, 241, 0.6)'; ctx.lineWidth = 3; ctx.stroke();
    });

    // 건물(노드) 그리기
    nodes.forEach(n => {
        n.typeInfo.shape.forEach(block => {
            const px = (n.x + block.x) * TILE_SIZE, py = (n.y + block.y) * TILE_SIZE;
            ctx.fillStyle = n.typeInfo.color; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            // 드래그 중이거나 선택된 기계 강조
            ctx.strokeStyle = (selectedNode === n || draggedNode === n) ? '#f1c40f' : '#2c3e50'; 
            ctx.lineWidth = (selectedNode === n || draggedNode === n) ? 3 : 1;
            ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        });

        const ports = getPorts(n);
        ctx.fillStyle = '#2ecc71'; ctx.beginPath(); ctx.arc(ports.inX, ports.inY, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(ports.outX, ports.outY, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();

        let maxX = 0, maxY = 0;
        n.typeInfo.shape.forEach(b => { if(b.x > maxX) maxX = b.x; if(b.y > maxY) maxY = b.y; });
        const centerX = (n.x + maxX/2) * TILE_SIZE + (TILE_SIZE / 2);
        const centerY = (n.y + maxY/2) * TILE_SIZE + (TILE_SIZE / 2);

        ctx.fillStyle = 'white'; ctx.textAlign = 'center';
        ctx.font = 'bold 12px Arial'; ctx.fillText(n.typeInfo.name, centerX, centerY - 6);
        ctx.font = '14px Arial'; ctx.fillText(`${n.resources} / ${n.typeInfo.maxCapacity}`, centerX, centerY + 12);
    });

    ctx.restore();
    requestAnimationFrame(gameLoop);
}

gameLoop();