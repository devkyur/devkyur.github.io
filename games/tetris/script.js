/***
 * 기능 추가
 * 1. HOLD 기능 만들기(shift 키)
 * 2. 랜덤으로 하단에 블럭 생성
 * 
 * 리펙토링
 * 1. 블럭을 배열로 변경 필요
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
 
 // 전역 변수
 let score = 0;
 let isGameOver = false;
 
 // 플레이어 객체: 현재 블록의 위치와 형태를 저장
 const player = {
   pos: { x: 0, y: 0 },
   matrix: null // playerReset()에서 설정됨
 };
 
 // 각 테트로미노별 색상 지정
 const colors = {
   'T': 'purple',
   'I': 'cyan',
   'O': 'yellow',
   'Z': 'red',
   'L': 'green',
   'K': '#FFA500',
 };
 
 // 게임 보드(아레나)를 생성하는 함수: 가로 16, 세로 32
 function createMatrix(w, h) {
   const matrix = [];
   while (h--) {
     matrix.push(new Array(w).fill(0));
   }
   return matrix;
 }
 const arena = createMatrix(16, 32);
 
 // 테트로미노(블록) 생성
 function createPiece(type) {
   switch (type) {
     case 'T':
       return [
         [0, 'T', 0],
         ['T', 'T', 'T'],
       ];
     case 'I':  // 일자형 블록
       return [
         [0, 0, 0, 0],
         ['I', 'I', 'I', 'I'],
         [0, 0, 0, 0],
         [0, 0, 0, 0],
       ];
     case 'O':  // O자형 블록
       return [
         ['O', 'O'],
         ['O', 'O'],
       ];
     case 'Z':  // Z자형 블록
       return [
         ['Z', 'Z', 0],
         [0, 'Z', 'Z'],
         [0, 0, 0],
       ];
     case 'L':  // L자형 블록
       return [
         ['L', 0],
         ['L', 0],
         ['L', 'L'],
       ];
     case 'K':  // 반대 L (나중에 배열로 리펙토링)
       return [
         [0, 'K'],
         [0, 'K'],
         ['K', 'K'],
       ];
     default:
       return [[0]];
   }
 }
 
 // 행렬(블록 또는 보드)를 캔버스에 그리는 함수
 function drawMatrix(matrix, offset) {
   matrix.forEach((row, y) => {
     row.forEach((value, x) => {
       if (value !== 0) {
         context.fillStyle = colors[value] || 'red';
         context.fillRect(x + offset.x, y + offset.y, 1, 1);
       }
     });
   });
 }
 
 // ghost piece(유령 블록)를 그리는 함수 (투명도 적용)
 function drawGhost(pos, matrix) {
   context.save();
   context.globalAlpha = 0.3;
   matrix.forEach((row, y) => {
     row.forEach((value, x) => {
       if (value !== 0) {
         context.fillStyle = colors[value] || 'red';
         context.fillRect(x + pos.x, y + pos.y, 1, 1);
       }
     });
   });
   context.restore();
 }
 
 // 다음 블럭을 그리는 함수
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
         nextContext.fillStyle = colors[value] || 'red';
         nextContext.fillRect(x + offset.x, y + offset.y, 1, 1);
       }
     });
   });
 }
 
 // 게임 보드 전체에 픽셀 단위 격자(점선) 그리기
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
 
 // draw() 함수에 효과 오버레이 그리기 추가
function draw() {
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width / blockSize, canvas.height / blockSize);
  
  drawMatrix(arena, { x: 0, y: 0 });
  
  // ghost piece 그리기
  const ghostPos = getGhostPosition();
  drawGhost(ghostPos, player.matrix);
  
  drawMatrix(player.matrix, player.pos);
  drawGrid();
  
  // 줄 제거 이펙트 그리기 (효과가 남은 줄에 흰색 오버레이)
  clearedRowEffects.forEach(effect => {
    // 효과 투명도는 남은 시간에 비례
    const alpha = effect.remaining / effect.total;
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = 'white';
    // 해당 줄의 영역 전체를 칠함 (여기서 arena[0].length는 열 수, 높이 1)
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
   for (let y = 0; y < m.length; ++y) {
     for (let x = 0; x < m[y].length; ++x) {
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
   player.pos.y--; // 마지막 유효 위치로 복원
   merge(arena, player);
   clearX();
   playerReset();
   dropCounter = 0;
 }

  // 전역 변수에 효과 저장 배열 추가
  let clearedRowEffects = [];
 
// 완전히 채워진 행을 제거하고 score를 업데이트하는 함수 (이펙트 추가 버전)
function clearX() {
  let rowsCleared = 0;
  for (let y = arena.length - 1; y >= 0; y--) {
    if (arena[y].every(cell => cell !== 0)) {
      // 효과 저장: y좌표(그리드 단위)와 500ms 지속
      clearedRowEffects.push({ gridY: y, remaining: 500, total: 500 });
      
      arena.splice(y, 1);
      arena.unshift(new Array(arena[0].length).fill(0));
      rowsCleared++;
      y++; // 삭제 후 인덱스 재조정
    }
  }
  if (rowsCleared > 0) {
    score += rowsCleared;
    updateScore();
  }
}

// clearedRowEffects 업데이트 함수 (deltaTime: ms 단위)
function updateClearedRowEffects(deltaTime) {
  clearedRowEffects.forEach(effect => {
    effect.remaining -= deltaTime;
  });
  // 지속 시간이 다 된 효과는 제거
  clearedRowEffects = clearedRowEffects.filter(effect => effect.remaining > 0);
}
 
 // score 업데이트 함수: DOM에 있는 score 표시 갱신
 function updateScore() {
   document.getElementById('score').innerText = "Score: " + score;
   updateSpeed(); // 점수 변화에 따라 속도 업데이트
 }
 
 // 난이도 조절을 위한 speed 업데이트 함수
 function updateSpeed() {
   // 매 1점마다 50ms씩 감소, 최소 100ms로 제한
   dropInterval = Math.max(100, 1000 - Math.floor(score / 1) * 50);
 }
 
 // 현재 플레이어 블록이 hard drop 시 도달할 위치 계산 (ghost position)
 function getGhostPosition() {
   let ghostPos = { x: player.pos.x, y: player.pos.y };
   while (!collide(arena, { pos: ghostPos, matrix: player.matrix })) {
     ghostPos.y++;
   }
   ghostPos.y--; // 마지막 유효 위치로 복원
   return ghostPos;
 }
 
 // 행렬 회전 함수 (90도 시계방향)
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
 
 // 전역 변수: 다음 블럭과 사용 가능한 블럭 종류
 const pieces = 'TIOZLK';
 let nextPiece = createPiece(pieces[Math.floor(Math.random() * pieces.length)]);
 
 // 새로운 블럭 생성 및 플레이어 위치 초기화 함수
 function playerReset() {
   player.matrix = nextPiece;
   nextPiece = createPiece(pieces[Math.floor(Math.random() * pieces.length)]);
   
   player.pos.y = 0;
   player.pos.x = ((arena[0].length / 2) | 0) - ((player.matrix[0].length / 2) | 0);
   
   if (collide(arena, player)) {
     gameOver();
   }
 }
 
 // 게임 오버 처리 함수: 게임 루프 중단 및 오버레이 표시
 function gameOver() {
   isGameOver = true;
 }
 
 // 게임 루프 관련 변수 및 업데이트 함수
 let dropCounter = 0;
 let dropInterval = 1000;
 let lastTime = 0;
 
// update() 함수에서 deltaTime을 이용해 효과 업데이트 추가
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
  
  // 효과 업데이트
  updateClearedRowEffects(deltaTime);
  
  draw();
  if (nextContext) drawNext();
  requestAnimationFrame(update);
}
 
 // 키보드 이벤트 처리
 document.addEventListener('keydown', event => {
   if (isGameOver) return; // 게임 오버 시 입력 무시
   
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
   }
 });
 
 playerReset();
 update();
 