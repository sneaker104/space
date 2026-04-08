// js/main.js

import { TILE_SIZE, BUILDINGS } from '../data/config.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);
resize();

let nodes = [];
let links = [];
let currentBuildMode = null;
let selectedNode = null;

// 1. UI 동적 생성
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

// 2. 헬퍼 함수
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

// 3. 캔버스 클릭 (설치 및 연결)
canvas.addEventListener('click', (e) => {
    const gridX = Math.floor(e.clientX / TILE_SIZE);
    const gridY = Math.floor(e.clientY / TILE_SIZE);
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

// 4. 게임 루프 (생산/이동 및 렌더링)
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

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; ctx.lineWidth = 1;
    for(let x = 0; x < canvas.width; x += TILE_SIZE) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for(let y = 0; y < canvas.height; y += TILE_SIZE) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

    links.forEach(link => {
        const p1 = getPorts(link.from), p2 = getPorts(link.to);
        ctx.beginPath(); ctx.moveTo(p1.outX, p1.outY); ctx.lineTo(p2.inX, p2.inY);
        ctx.strokeStyle = 'rgba(236, 240, 241, 0.6)'; ctx.lineWidth = 3; ctx.stroke();
    });

    nodes.forEach(n => {
        n.typeInfo.shape.forEach(block => {
            const px = (n.x + block.x) * TILE_SIZE, py = (n.y + block.y) * TILE_SIZE;
            ctx.fillStyle = n.typeInfo.color; ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = (selectedNode === n) ? '#f1c40f' : '#2c3e50'; ctx.lineWidth = (selectedNode === n) ? 3 : 1;
            ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        });

        const ports = getPorts(n);
        ctx.fillStyle = '#2ecc71'; ctx.beginPath(); ctx.arc(ports.inX, ports.inY, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(ports.outX, ports.outY, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();

        let maxX = 0, maxY = 0;
        n.typeInfo.shape.forEach(b => { if(b.x > maxX) maxX = b.x; if(b.y > maxY) maxY = b.y; });
        const centerX = (n.x + maxX/2) * TILE_SIZE + (TILE_SIZE / 2), centerY = (n.y + maxY/2) * TILE_SIZE + (TILE_SIZE / 2);

        ctx.fillStyle = 'white'; ctx.textAlign = 'center';
        ctx.font = 'bold 12px Arial'; ctx.fillText(n.typeInfo.name, centerX, centerY - 6);
        ctx.font = '14px Arial'; ctx.fillText(`${n.resources} / ${n.typeInfo.maxCapacity}`, centerX, centerY + 12);
    });

    requestAnimationFrame(gameLoop);
}

gameLoop();