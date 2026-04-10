// data/config.js

export const TILE_SIZE = 60; 
export const TRANSFER_RATE = 20; // 선을 타고 이동하는 초당 자원 수 (20/sec)

// 초기에 기본으로 지을 수 있는 건물들
export const INITIAL_UNLOCKED = ["sawmill", "stone_miner", "storage"];

export const BUILDINGS = {
    sawmill: {
        id: "sawmill", name: "제재소", color: "#8b5a2b", 
        shape: [{x: 0, y: 0}], input: null, output: "wood", 
        maxCapacity: 100, generationPerSec: 2.0 // 초당 2개 생산
    },
    stone_miner: {
        id: "stone_miner", name: "돌 채굴기", color: "#7f8c8d", 
        shape: [{x: 0, y: 0}, {x: 1, y: 0}], input: null, output: "stone", 
        maxCapacity: 100, generationPerSec: 1.0 
    },
    storage: {
        id: "storage", name: "종합 물류창고", color: "#34495e", 
        shape: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: 1}, {x: 1, y: 1}], 
        input: "all", output: "all", maxCapacity: 1000
    },
    // --- 아래는 업그레이드 시 해금되는 건물들 ---
    iron_miner: {
        id: "iron_miner", name: "철 채굴기", color: "#bdc3c7", 
        shape: [{x: 0, y: 0}], input: null, output: "iron", 
        maxCapacity: 100, generationPerSec: 1.0
    },
    steel_factory: {
        id: "steel_factory", name: "강철 제련소", color: "#2c3e50", 
        shape: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: 1}, {x: 1, y: 1}], 
        input: ["iron", "wood"], output: "steel", maxCapacity: 200, 
        recipe: { iron: 1, wood: 1 }, // 1철 + 1목재 = 1강철
        generationPerSec: 0.5 // 초당 0.5개 생산 (2초에 1개)
    },
    stone_factory: {
        id: "stone_factory", name: "석재 공장", color: "#95a5a6", 
        shape: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: 1}, {x: 1, y: 1}], 
        input: ["stone", "wood"], output: "brick", maxCapacity: 200, 
        recipe: { stone: 1, wood: 1 }, // 1돌 + 1목재 = 1벽돌
        generationPerSec: 0.5
    }
};

// 업그레이드(연구) 트리 정의
export const UPGRADES = {
    unlock_iron_age: {
        id: "unlock_iron_age",
        name: "철기 시대",
        desc: "철 채굴기, 강철 제련소, 석재 공장을 해금합니다.",
        cost: { stone: 100 }, // 창고에 돌 100개가 있어야 연구 가능
        unlocks: ["iron_miner", "steel_factory", "stone_factory"]
    }
};