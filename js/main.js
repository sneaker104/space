// js/main.js

// 1. 데이터 파일 불러오기
import { BUILDINGS, RESOURCES } from '../data/config.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// 게임 상태
let nodes = [];
let links = [];
let currentBuildMode = null;
let selectedNode = null;

// 2. UI 동적 생성 (config.js의 데이터를 바탕으로 버튼 만들기)
const menuContainer = document.getElementById('build-menu-container');
Object.values(BUILDINGS).forEach(building => {
    const btn = document.createElement('div');
    btn.className = 'build-item';
    btn.dataset.type = building.id;
    btn.innerHTML = `<b>${building.name}</b><br><small>${building.desc}</small>`;
    
    btn.addEventListener('click', () => {
        document.querySelectorAll('.build-item').forEach(el => el.classList.remove('active'));
        if (currentBuildMode === building.id) {
            currentBuildMode = null;
        } else {
            btn.classList.add('active');
            currentBuildMode = building.id;
            selectedNode = null;
        }
    });
    menuContainer.appendChild(btn);
});

// 메뉴 토글 기능
const toggleBtn = document.getElementById('toggle-btn');
const sidebar = document.getElementById('sidebar');
toggleBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

// 3. 캔버스 클릭 이벤트 (설치 및 연결)
canvas.addEventListener('click', (e) => {
    let clickedNode = nodes.find(n => Math.hypot(n.x - e.clientX, n.y - e.clientY) < 30);

    if (currentBuildMode) {
        if (!clickedNode) {
            nodes.push({
                id: Date.now(),
                x: e.clientX,
                y: e.clientY,
                typeInfo: BUILDINGS[currentBuildMode], // config에서 가져온 속성 연결
                inventory: {} // 자원 보관함 (예: { iron_ore: 5 })
            });
            currentBuildMode = null;
            document.querySelectorAll('.build-item').forEach(el => el.classList.remove('active'));
        }
    } else {
        if (clickedNode) {
            if (!selectedNode) {
                selectedNode = clickedNode; // 출발지 선택
            } else {
                if (selectedNode.id !== clickedNode.id) {
                    // 도착지 선택 및 연결 저장
                    links.push({ from: selectedNode, to: clickedNode });
                }
                selectedNode = null;
            }
        } else {
            selectedNode = null;
        }
    }
});

// 4. 게임 루프 (자원 이동 로직)
let lastTick = Date.now();

function gameLoop() {
    const now = Date.now();
    
    if (now - lastTick > 1000) { // 1초마다 실행
        // ① 자원 생산
        nodes.forEach(n => {
            if (n.typeInfo.input === null && n.typeInfo.output) {
                // 채굴기처럼 인풋이 없는 경우 아웃풋 자원 생성
                n.inventory[n.typeInfo.output] = (n.inventory[n.typeInfo.output] || 0) + 1;
            }
            
            // 용광로 처리 (인풋이 있고, 그 인풋 자원을 가지고 있다면)
            if (n.typeInfo.input !== null && n.typeInfo.input !== "all") {
                if (n.inventory[n.typeInfo.input] > 0) {
                    n.inventory[n.typeInfo.input] -= 1; // 원료 소모
                    n.inventory[n.typeInfo.output] = (n.inventory[n.typeInfo.output] || 0) + 1; // 결과물 생성
                }
            }
        });

        // ② 자원 이동 (조건 검사 추가)
        links.forEach(link => {
            const outType = link.from.typeInfo.output;
            const inType = link.to.typeInfo.input;

            // 출발지에 보낼 자원이 있고, 도착지가 그 자원을 받을 수 있거나 'all'인 경우에만 이동
            if (outType && link.from.inventory[outType] > 0) {
                if (inType === outType || inType === "all") {
                    link.from.inventory[outType] -= 1;
                    link.to.inventory[outType] = (link.to.inventory[outType] || 0) + 1;
                }
            }
        });
        lastTick = now;
    }

    // 5. 그리기 로직
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    links.forEach(link => {
        ctx.beginPath();
        ctx.moveTo(link.from.x, link.from.y);
        ctx.lineTo(link.to.x, link.to.y);
        ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 3; ctx.stroke();
    });

    nodes.forEach(n => {
        ctx.beginPath(); ctx.arc(n.x, n.y, 30, 0, Math.PI * 2);
        ctx.fillStyle = n.typeInfo.color; ctx.fill();
        
        if (selectedNode === n) {
            ctx.strokeStyle = 'white'; ctx.lineWidth = 3; ctx.stroke();
        }

        // 보유 자원 텍스트 표시
        ctx.fillStyle = 'white'; ctx.font = '12px Arial'; ctx.textAlign = 'center';
        let yOffset = -5;
        for (const [resType, amount] of Object.entries(n.inventory)) {
            if (amount > 0) {
                const icon = RESOURCES[resType]?.icon || "";
                ctx.fillText(`${icon} ${amount}`, n.x, n.y + yOffset);
                yOffset += 15;
            }
        }
        ctx.fillText(n.typeInfo.name, n.x, n.y - 40);
    });

    requestAnimationFrame(gameLoop);
}

gameLoop();