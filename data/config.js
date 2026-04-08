// data/config.js

export const TILE_SIZE = 60; // 맵 격자(그리드)의 1칸 크기

// 건설 가능한 기계들의 속성 (크기, 색상, 입출력 정의)
export const BUILDINGS = {
    stone_miner: {
        id: "stone_miner", 
        name: "돌 채굴기",
        color: "#71797e", // 강철색
        shape: [{x: 0, y: 0}, {x: 1, y: 0}], // 가로 2칸 차지
        input: null, 
        output: "stone",
        maxCapacity: 100
    },
    copper_miner: {
        id: "copper_miner", 
        name: "구리 채굴기",
        color: "#b87333", // 구리색
        shape: [{x: 0, y: 0}], // 1x1 칸 차지
        input: null, 
        output: "copper",
        maxCapacity: 75
    },
    steel_miner: {
        id: "steel_miner", 
        name: "강철 채굴기",
        color: "#71797e", // 강철색
        shape: [{x: 0, y: 0}, {x: 1, y: 0}], // 가로 2칸 차지
        input: null, 
        output: "steel",
        maxCapacity: 50
    },
    storage: {
        id: "storage", 
        name: "종합 물류창고",
        color: "#34495e", // 파란색
        shape: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: 1}, {x: 1, y: 1}], // 2x2 칸 (정사각형)
        input: "all", 
        output: "all",  // 저장소에서도 다른 곳으로 뺄 수 있도록 변경
        maxCapacity: 1000
    }
};