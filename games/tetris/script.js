/***
 * [기능 추가]
 * 웹소켓 이용한 방 만들기 / 같이 게임하기
 * 아이템 기능
 *
 * [리펙토링]
 * 
 */

 const canvas = document.getElementById('tetris');
 const context = canvas.getContext('2d');
 
 // 블록의 크기 (픽셀 단위)
 const blockSize = 20;
 context.scale(blockSize, blockSize);
 
 // next piece preview용 캔버스 설정
 const nextCanvas = document.getElementById('next');
 const nextContext = nextCanvas ? nextCanvas.getContext('2d') : null;
 if (nextCanvas && nextContext) {
   nextCanvas.width = 120;
   nextCanvas.height = 120;
   nextContext.scale(blockSize, blockSize);
 }
 
 // HOLD 영역 캔버스 설정 (HTML에 <canvas id="hold"></canvas> 있어야 함)
 const holdCanvas = document.getElementById('hold');
 const holdContext = holdCanvas ? holdCanvas.getContext('2d') : null;
 if (holdCanvas && holdContext) {
   holdCanvas.width = 120;
   holdCanvas.height = 120;
   holdContext.scale(blockSize, blockSize);
 }
 
 // 전역 변수
 let score = 0;
 let isGameOver = false;
 
 // HOLD 관련 전역 변수
 let holdPiece = null; // 처음에는 HOLD 영역이 비어있음
 let holdUsed = false; // 한 드롭 당 한 번만 사용 가능
 
 // 플레이어 객체: 현재 블록의 위치와 모양을 저장
 const player = {
   pos: { x: 0, y: 0 },
   matrix: null // playerReset()에서 설정됨
 };
 
 // blocks 객체: 각 블록의 색상과 가중치 등 확장 가능한 정보
 const blocks = {
   T:    { color: 'purple',   weight: 1 },
   I:    { color: 'cyan',     weight: 2 },
   O:    { color: 'yellow',   weight: 1 },
   Z:    { color: 'red',      weight: 1 },
   RZ:   { color: 'pink',     weight: 1 },
   L:    { color: 'green',    weight: 1 },
   RL:   { color: '#FFA500',  weight: 1 },
   TEST: { color: 'yellow',   weight: 0 },
   G:    { color: 'gray',     weight: 0 }
 };
 
 // arena (게임 보드) 생성 – 여기서는 16 x 32 크기
 function createMatrix(w, h) {
   const matrix = [];
   while (h--) {
     matrix.push(new Array(w).fill(0));
   }
   return matrix;
 }
 const arena = createMatrix(16, 32);
 
 // 테트로미노(블록) 생성 함수 (각 타입에 따른 모양 반환)
 function createPiece(type) {
   switch (type) {
     case 'TEST':
       return [
         ['TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST'],
         ['TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST','TEST']
       ];
     case 'T':
       return [
         [0, 'T', 0],
         ['T', 'T', 'T']
       ];
     case 'I':
       return [
         ['I','I','I','I']
       ];
     case 'O':
       return [
         ['O','O'],
         ['O','O']
       ];
     case 'Z':
       return [
         ['Z','Z',0],
         [0,'Z','Z']
       ];
     case 'RZ':
       return [
         [0, 'RZ', 'RZ'],
         ['RZ','RZ',0]
       ];
     case 'L':
       return [
         ['L', 0],
         ['L', 0],
         ['L','L']
       ];
     case 'RL':
       return [
         [0, 'RL'],
         [0, 'RL'],
         ['RL','RL']
       ];
     default:
       return [[0]];
   }
 }
 
 // pieces 배열: 사용할 블록 타입을 배열로 관리 (원하는 타입 추가 가능)
 const pieces = ['T', 'I', 'O', 'Z', 'RZ', 'L', 'RL'];
 
  // 가중치 기반 무작위 블록 선택 함수
  function getRandomPieceType() {
    const totalWeight = pieces.reduce((sum, type) => sum + blocks[type].weight, 0);
    let random = Math.random() * totalWeight;
    for (let type of pieces) {
      if (random < blocks[type].weight) {
        return type;
      }
      random -= blocks[type].weight;
    }
    return pieces[0];
  }
 
 // 다음 블럭 생성 시, 가중치에 따라 선택
 let nextPiece = createPiece(getRandomPieceType());
 
 // 행렬(블록 또는 보드)를 메인 캔버스에 그리는 함수
 function drawMatrix(matrix, offset) {
   matrix.forEach((row, y) => {
     row.forEach((value, x) => {
       if (value !== 0) {
         context.fillStyle = blocks[value] ? blocks[value].color : 'red';
         context.fillRect(x + offset.x, y + offset.y, 1, 1);
       }
     });
   });
 }
 
 // ghost piece (유령 블록) 그리기 (투명도 적용)
 function drawGhost(pos, matrix) {
   context.save();
   context.globalAlpha = 0.3;
   matrix.forEach((row, y) => {
     row.forEach((value, x) => {
       if (value !== 0) {
         context.fillStyle = blocks[value] ? blocks[value].color : 'red';
         context.fillRect(x + pos.x, y + pos.y, 1, 1);
       }
     });
   });
   context.restore();
 }
 
 // NEXT 영역에 다음 블럭 그리기
 function drawNext() {
   if (!nextContext) return;
   nextContext.fillStyle = '#000';
   nextContext.fillRect(0, 0, nextCanvas.width / blockSize, nextCanvas.height / blockSize);
   
   const offset = {
     x: Math.floor((nextCanvas.width / blockSize - nextPiece[0].length) / 2),
     y: Math.floor((nextCanvas.height / blockSize - nextPiece.length) / 2)
   };
   nextPiece.forEach((row, y) => {
     row.forEach((value, x) => {
       if (value !== 0) {
         nextContext.fillStyle = blocks[value] ? blocks[value].color : 'red';
         nextContext.fillRect(x + offset.x, y + offset.y, 1, 1);
       }
     });
   });
 }
 
 // HOLD 영역에 저장된 블럭 그리기
 function drawHold() {
   if (!holdContext) return;
   holdContext.fillStyle = '#000';
   holdContext.fillRect(0, 0, holdCanvas.width / blockSize, holdCanvas.height / blockSize);
   if (holdPiece) {
     const offset = {
       x: Math.floor((holdCanvas.width / blockSize - holdPiece[0].length) / 2),
       y: Math.floor((holdCanvas.height / blockSize - holdPiece.length) / 2)
     };
     holdPiece.forEach((row, y) => {
       row.forEach((value, x) => {
         if (value !== 0) {
           holdContext.fillStyle = blocks[value] ? blocks[value].color : 'red';
           holdContext.fillRect(x + offset.x, y + offset.y, 1, 1);
         }
       });
     });
   }
 }
 
 // 격자(점선) 그리기
 function drawGrid() {
   context.strokeStyle = 'rgba(255,255,255,0.3)';
   context.lineWidth = 0.05;
   context.setLineDash([0.1, 0.1]);
   for (let x = 0; x <= arena[0].length; x++) {
     context.beginPath();
     context.moveTo(x, 0);
     context.lineTo(x, arena.length);
     context.stroke();
   }
   for (let y = 0; y <= arena.length; y++) {
     context.beginPath();
     context.moveTo(0, y);
     context.lineTo(arena[0].length, y);
     context.stroke();
   }
   context.setLineDash([]);
 }
 
 // 줄 제거 이펙트를 위한 전역 변수
 let clearedRowEffects = [];
 
 // 전체 게임 상태 그리기 (배경, arena, ghost, player, 격자, 이펙트)
 function draw() {
   context.fillStyle = '#000';
   context.fillRect(0, 0, canvas.width / blockSize, canvas.height / blockSize);
   
   drawMatrix(arena, { x: 0, y: 0 });
   
   // ghost piece 그리기
   const ghostPos = getGhostPosition();
   drawGhost(ghostPos, player.matrix);
   
   drawMatrix(player.matrix, player.pos);
   drawGrid();
   
   // 줄 제거 이펙트 그리기
   clearedRowEffects.forEach(effect => {
     const alpha = effect.remaining / effect.total;
     context.save();
     context.globalAlpha = alpha;
     context.fillStyle = 'white';
     context.fillRect(0, effect.gridY, arena[0].length, 1);
     context.restore();
   });
   
   // 게임 오버 상태이면 오버레이 텍스트 표시
   if (isGameOver) {
     context.fillStyle = 'rgba(0, 0, 0, 0.75)';
     context.fillRect(0, arena.length / 4, arena[0].length, arena.length / 2);
     context.fillStyle = 'white';
     context.font = '1px Arial';
     context.textAlign = 'center';
     context.fillText('GAME OVER', arena[0].length / 2, arena.length / 2);
   }
 }
 
 // 충돌 감지 함수
 function collide(arena, player) {
   const m = player.matrix;
   const o = player.pos;
   for (let y = 0; y < m.length; y++) {
     for (let x = 0; x < m[y].length; x++) {
       if (m[y][x] !== 0) {
         if (!arena[y + o.y] || arena[y + o.y][x + o.x] !== 0) {
           return true;
         }
       }
     }
   }
   return false;
 }
 
 // 플레이어의 블록을 아레나에 병합하는 함수
 function merge(arena, player) {
   player.matrix.forEach((row, y) => {
     row.forEach((value, x) => {
       if (value !== 0) {
         arena[y + player.pos.y][x + player.pos.x] = value;
       }
     });
   });
 }
 
 // hard drop: 블록을 가능한 가장 아래까지 떨어뜨림
 function hardDrop() {
   while (!collide(arena, player)) {
     player.pos.y++;
   }
   player.pos.y--; // 마지막 유효 위치 복원
   merge(arena, player);
   clearX();
   playerReset();
   dropCounter = 0;
 }
 
 // 완전히 채워진 행 제거, 이펙트 및 점수 업데이트
 function clearX() {
   let rowsCleared = 0;
   for (let y = arena.length - 1; y >= 0; y--) {
     if (arena[y].every(cell => cell !== 0)) {
       clearedRowEffects.push({ gridY: y, remaining: 500, total: 500 });
       arena.splice(y, 1);
       arena.unshift(new Array(arena[0].length).fill(0));
       rowsCleared++;
       y++;
     }
   }
   if (rowsCleared > 0) {
     score += rowsCleared;
     updateScore();
   }
 }
 
 let lastScoreForGarbage = 0;
 
 // 점수 업데이트 및 회색 행(garbage row) 추가 (3점마다)
 function updateScore() {
   document.getElementById('score').innerText = "Score: " + score;
   
   while (score - lastScoreForGarbage >= 3) {
     addGarbageBlocks();
     lastScoreForGarbage += 3;
   }
   
   updateSpeed();
 }
 
 // 회색 블럭(garbage row) 추가 함수
 function addGarbageBlocks() {
   const colCount = arena[0].length;
   let newRow = new Array(colCount).fill(0);
   const minBlocks = Math.floor(colCount * 0.7);
   const maxBlocks = Math.floor(colCount * 0.8);
   const numBlocks = Math.floor(Math.random() * (maxBlocks - minBlocks + 1)) + minBlocks;
   
   let placed = 0;
   while (placed < numBlocks) {
     let randomCol = Math.floor(Math.random() * colCount);
     if (newRow[randomCol] === 0) {
       newRow[randomCol] = 'G';
       placed++;
     }
   }
   
   arena.shift();
   arena.push(newRow);
 }
 
 // 난이도 조절: 1점당 100ms 감소, 최소 100ms
 function updateSpeed() {
   dropInterval = Math.max(100, 1000 - score * 100);
 }
 
 // 줄 제거 이펙트 업데이트 (deltaTime 단위)
 function updateClearedRowEffects(deltaTime) {
   clearedRowEffects.forEach(effect => {
     effect.remaining -= deltaTime;
   });
   clearedRowEffects = clearedRowEffects.filter(effect => effect.remaining > 0);
 }
 
 // ghost piece 위치 계산
 function getGhostPosition() {
   let ghostPos = { x: player.pos.x, y: player.pos.y };
   while (!collide(arena, { pos: ghostPos, matrix: player.matrix })) {
     ghostPos.y++;
   }
   ghostPos.y--;
   return ghostPos;
 }
 
 // 행렬 회전 (90도 시계방향)
 function transblock(matrix) {
   const rows = matrix.length;
   const cols = matrix[0].length;
   const rotated = [];
   for (let col = 0; col < cols; col++) {
     rotated[col] = [];
     for (let row = rows - 1; row >= 0; row--) {
       rotated[col].push(matrix[row][col]);
     }
   }
   return rotated;
 }
 
 // 플레이어 초기화 및 다음 블록 생성
 function playerReset() {
   holdUsed = false; // 새 블록 등장 시 HOLD 사용 초기화
   player.matrix = nextPiece;
   nextPiece = createPiece(getRandomPieceType());
   
   player.pos.y = 0;
   player.pos.x = ((arena[0].length / 2) | 0) - ((player.matrix[0].length / 2) | 0);
   
   if (collide(arena, player)) {
     gameOver();
   }
 }
 
 function gameOver() {
   isGameOver = true;
 }
 
 let dropCounter = 0;
 let dropInterval = 1000;
 let lastTime = 0;
 
 function update(time = 0) {
   const deltaTime = time - lastTime;
   lastTime = time;
   
   if (isGameOver) {
     draw();
     return;
   }
   
   dropCounter += deltaTime;
   if (dropCounter > dropInterval) {
     player.pos.y++;
     if (collide(arena, player)) {
       player.pos.y--;
       merge(arena, player);
       clearX();
       playerReset();
     }
     dropCounter = 0;
   }
   
   updateClearedRowEffects(deltaTime);
   
   draw();
   if (nextContext) drawNext();
   if (holdContext) drawHold();
   requestAnimationFrame(update);
 }
 
 document.addEventListener('keydown', event => {
   if (isGameOver) return;
   
   if (event.code === 'ArrowLeft') {
     player.pos.x--;
     if (collide(arena, player)) {
       player.pos.x++;
     }
   } else if (event.code === 'ArrowRight') {
     player.pos.x++;
     if (collide(arena, player)) {
       player.pos.x--;
     }
   } else if (event.code === 'ArrowDown') {
     player.pos.y++;
     if (collide(arena, player)) {
       player.pos.y--;
       merge(arena, player);
       clearX();
       playerReset();
     }
     dropCounter = 0;
   } else if (event.code === 'ArrowUp') {
     const pos = player.pos.x;
     const prevMatrix = player.matrix;
     player.matrix = transblock(player.matrix);
     
     let offset = 1;
     while (collide(arena, player)) {
       player.pos.x += offset;
       offset = -(offset + (offset > 0 ? 1 : -1));
       if (Math.abs(player.pos.x - pos) > player.matrix[0].length) {
         player.matrix = prevMatrix;
         player.pos.x = pos;
         break;
       }
     }
   } else if (event.code === 'Space') {
     hardDrop();
   } else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
     if (!holdUsed) {
       holdUsed = true;
       if (holdPiece === null) {
         holdPiece = player.matrix;
         playerReset();
       } else {
         let temp = player.matrix;
         player.matrix = holdPiece;
         holdPiece = temp;
         player.pos.x = ((arena[0].length / 2) | 0) - ((player.matrix[0].length / 2) | 0);
         player.pos.y = 0;
       }
     }
   }
 });
 
 playerReset();
 update();
 