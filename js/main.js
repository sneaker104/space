// js/main.js

import { TILE_SIZE, BUILDINGS } from '../data/config.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------
// [신규] 카메라(시점) 상태 변수
// ---------------------------------------------------
let camera = { x: 0, y: 0, zoom: 1 };
let isDragging = false;
let lastMouse = { x: 0, y: 0 };

let nodes = [];
let links = [];
let currentBuildMode = null;
let selectedNode = null;

// UI 동적 생성 (생략 없이 원본 그대로 유지)
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

// 메뉴 열기/닫기
const toggleBtn = document.getElementById('toggle-btn');
const sidebar = document.getElementById('sidebar');
toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    toggleBtn.innerText = sidebar.classList.contains('open') ? '건설 메뉴 닫기 ▶' : '건설 메뉴 열기 ◀';
});

// ---------------------------------------------------
// [신규] 카메라 조작 이벤트 (확대/축소/이동)
// ---------------------------------------------------
// 1) 마우스 휠 (확대/축소)
canvas.addEventListener('wheel', (e) => {
    const zoomAmount = 0.1;
    const oldZoom = camera.zoom;
    
    if (e.deltaY < 0) camera.zoom = Math.min(camera.zoom + zoomAmount, 3);   // 최대 3배 확대
    else camera.zoom = Math.max(camera.zoom - zoomAmount, 0.4); // 최소 0.4배 축소

    // 마우스 포인터를 기준으로 확대/축소되도록 보정
    camera.x = e.clientX - (e.clientX - camera.x) * (camera.zoom / oldZoom);
    camera.y = e.clientY - (e.clientY - camera.y) * (camera.zoom / oldZoom);
});

// 2) 마우스 우클릭 드래그 (화면 이동)
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2) { // 우클릭
        isDragging = true;
        lastMouse = { x: e.clientX, y: e.clientY };
    }
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 2) isDragging = false;
});
window.addEventListener('mousemove', (e) => {
    if (isDragging) {
        camera.x += (e.clientX - lastMouse.x);
        camera.y += (e.clientY - lastMouse.y);
        lastMouse = { x: e.clientX, y: e.clientY };
    }
});
// 우클릭 시 기본 메뉴(새로고침 등) 뜨는 것 방지
canvas.addEventListener('contextmenu', e => e.preventDefault());

// 화면 좌표를 게임 속 월드 좌표로 변환하는 함수
function screenToWorld(screenX, screenY) {
    return {
        x: (screenX - camera.x) / camera.zoom,
        y: (screenY - camera.y) / camera.zoom
    };
}

// ---------------------------------------------------
// 헬퍼 함수
// ---------------------------------------------------
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

// ---------------------------------------------------
// 캔버스 클릭 (설치 및 연결)
// ---------------------------------------------------
canvas.addEventListener('click', (e) => {
    // [중요] 마우스로 클릭한 화면 좌표를 카메라 줌 상태가 반영된 실제 맵 좌표로 변환!
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const gridX = Math.floor(worldPos.x / TILE_SIZE);
    const gridY = Math.floor(worldPos.y / TILE_SIZE);
    
    const clickedNode = getBuildingAt(gridX, gridY);

    if (currentBuildMode) {
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
        if (clickedNode) {
            if (!selectedNode) selectedNode = clickedNode;
            else {
                if (selectedNode.id !== clickedNode.id) links.push({ from: selectedNode, to: clickedNode });
                selectedNode = null; 
            }
        } else selectedNode = null; 
    }
});

// ---------------------------------------------------
// 게임 루프 (생산/이동 및 렌더링)
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

    // 카메라(Zoom & Pan) 적용
    ctx.save(); 
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // 무한 배경 그리드(격자) 그리기
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; 
    ctx.lineWidth = 1 / camera.zoom; // 확대해도 격자 선 두께는 일정하게 유지
    
    // 현재 화면에 보이는 영역만 계산하여 효율적으로 격자 생성
    const startX = Math.floor(-camera.x / camera.zoom / TILE_SIZE) * TILE_SIZE;
    const startY = Math.floor(-camera.y / camera.zoom / TILE_SIZE) * TILE_SIZE;
    const endX = startX + (canvas.width / camera.zoom) + TILE_SIZE;
    const endY = startY + (canvas.height / camera.zoom) + TILE_SIZE;

    for(let x = startX; x < endX; x += TILE_SIZE) { ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke(); }
    for(let y = startY; y < endY; y += TILE_SIZE) { ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke(); }

    // 선 그리기
    links.forEach(link => {
        const p1 = getPorts(link.from), p2 = getPorts(link.to);
        ctx.beginPath(); ctx.moveTo(p1.outX, p1.outY); ctx.lineTo(p2.inX, p2.inY);
        ctx.strokeStyle = 'rgba(236, 240, 241, 0.6)'; ctx.lineWidth = 3; ctx.stroke();
    });

    // 노드(건물) 그리기
    nodes.forEach(n => {
        n.typeInfo.shape.forEach(block => {
            const px = (n.x + block.x) * TILE_SIZE, py = (n.y + block.y) * TILE_SIZE;
            ctx.fillStyle = n.typeInfo.color; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = (selectedNode === n) ? '#f1c40f' : '#2c3e50'; 
            ctx.lineWidth = (selectedNode === n) ? 3 : 1;
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

    // 카메라 셋팅 복구
    ctx.restore();

    requestAnimationFrame(gameLoop);
}

gameLoop();