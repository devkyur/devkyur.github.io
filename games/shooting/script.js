  // 전체 맵 크기
  const mapWidth = 2000;
  const mapHeight = 2000;
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // 카메라 객체: 보이는 영역은 800×600
  const camera = { x: 0, y: 0 };

  // 게임 상태: 'playing', 'levelUp', 'gameOver'
  let gameState = 'playing';

  // 게임 시간 및 보스 관련 변수
  let gameTime = 0;
  let lastBossThreshold = 0; // 10초 단위

  // 플레이어 객체 (맵 좌표 사용)
  const player = {
    x: mapWidth / 2,
    y: mapHeight / 2,
    radius: 10,
    speed: 3,
    level: 1,
    xp: 0,
    xpToLevel: 5,
    attackInterval: 500,
    attackCooldown: 0,
    attack: 1,
    hp: 10,
    maxHp: 10,
    defense: 0,
    penetrationCount: 0,
    guidedMissileActive: false
  };

  // 스킬 풀
  const skillPool = [
    { 
      id: 'rapidFire', 
      name: '공격속도 5% UP', 
      repeatable: true,
      weight: 1,
      apply: () => { player.attackInterval *= 0.95; } 
    },
    { 
      id: 'spreadShot', 
      name: '공격력 5% UP', 
      repeatable: true,
      weight: 1,
      apply: () => { player.attack *= 1.05; } 
    },
    { 
      id: 'hpRecovery', 
      name: 'HP 2 회복', 
      repeatable: true,
      weight: 1,
      apply: () => { player.hp = Math.min(player.hp + 2, player.maxHp); } 
    },
    { 
      id: 'penetration', 
      name: '관통', 
      repeatable: true,
      weight: 0.2,
      apply: () => { player.penetrationCount++; } 
    },
    { 
      id: 'guidedMissile', 
      name: '유도탄', 
      repeatable: false,
      weight: 1,
      apply: () => { player.guidedMissileActive = true; } 
    },
    { 
      id: 'moveSpeedUp', 
      name: '이동속도 5% 증가', 
      repeatable: true,
      weight: 1,
      apply: () => { player.speed *= 1.05; }
    },
    { 
      id: 'maxHpUp', 
      name: '최대 체력 2 증가', 
      repeatable: true,
      weight: 1,
      apply: () => { 
        player.maxHp += 2; 
        player.hp += 2; 
      }
    }
  ];

  // 장애물 관련: 최대 3개, 크기 150×150, 지속 시간 3~7초
  let obstacles = [];
  let lastObstacleSpawn = 0;

  // 유틸리티 함수: clamp, circleRectCollision
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function circleRectCollision(circle, rect) {
    let closestX = clamp(circle.x, rect.x, rect.x + rect.width);
    let closestY = clamp(circle.y, rect.y, rect.y + rect.height);
    let dx = circle.x - closestX;
    let dy = circle.y - closestY;
    return (dx * dx + dy * dy) <= (circle.radius * circle.radius);
  }

  // Fisher–Yates 셔플 및 가중치 기반 랜덤 선택 함수
  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
  function selectWeightedRandom(arr, n) {
    let selected = [];
    let pool = arr.slice();
    for (let i = 0; i < n && pool.length > 0; i++) {
      let totalWeight = pool.reduce((sum, skill) => sum + (skill.weight || 1), 0);
      let r = Math.random() * totalWeight;
      let cumulative = 0;
      let chosenIndex = 0;
      for (let j = 0; j < pool.length; j++) {
        cumulative += (pool[j].weight || 1);
        if (r < cumulative) {
          chosenIndex = j;
          break;
        }
      }
      selected.push(pool.splice(chosenIndex, 1)[0]);
    }
    return selected;
  }

  // 게임 엔티티 배열들
  let monsters = [];
  let bullets = [];
  let items = [];

  // 키 입력 상태
  let keys = {};
  window.addEventListener('keydown', e => { keys[e.key] = true; });
  window.addEventListener('keyup', e => { keys[e.key] = false; });

  // 장애물 생성, 업데이트, 그리기
  // 플레이어의 안전 영역(반경 150픽셀)에는 생성되지 않음
  function spawnObstacle() {
    const width = 150, height = 150;
    const safeMargin = 150;
    let attempts = 0;
    let valid = false;
    let x, y;
    while (attempts < 10 && !valid) {
      x = Math.random() * (mapWidth - width);
      y = Math.random() * (mapHeight - height);
      const safeArea = {
        x: player.x - safeMargin,
        y: player.y - safeMargin,
        width: safeMargin * 2,
        height: safeMargin * 2
      };
      const obstacleRect = { x, y, width, height };
      if (
        obstacleRect.x + obstacleRect.width < safeArea.x ||
        obstacleRect.x > safeArea.x + safeArea.width ||
        obstacleRect.y + obstacleRect.height < safeArea.y ||
        obstacleRect.y > safeArea.y + safeArea.height
      ) {
        valid = true;
      }
      attempts++;
    }
    if (valid) {
      const lifetime = 3000 + Math.random() * 4000;
      obstacles.push({ x, y, width, height, lifetime });
    }
  }
  function updateObstacles(deltaTime) {
    for (let i = obstacles.length - 1; i >= 0; i--) {
      obstacles[i].lifetime -= deltaTime;
      if (obstacles[i].lifetime <= 0) {
        obstacles.splice(i, 1);
      }
    }
  }
  function drawObstacles() {
    obstacles.forEach(obs => {
      ctx.fillStyle = 'gray';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    });
  }

  // 플레이어 이동 업데이트 (전체 맵 좌표 사용, 장애물 충돌 처리)
  function updatePlayer(deltaTime) {
    let oldX = player.x, oldY = player.y;
    if (keys['ArrowUp'] || keys['w']) player.y -= player.speed;
    if (keys['ArrowDown'] || keys['s']) player.y += player.speed;
    if (keys['ArrowLeft'] || keys['a']) player.x -= player.speed;
    if (keys['ArrowRight'] || keys['d']) player.x += player.speed;
    // 맵 경계 처리
    if (player.x < player.radius) player.x = player.radius;
    if (player.x > mapWidth - player.radius) player.x = mapWidth - player.radius;
    if (player.y < player.radius) player.y = player.radius;
    if (player.y > mapHeight - player.radius) player.y = mapHeight - player.radius;
    // 장애물 충돌 시 이전 위치 복귀
    for (let obs of obstacles) {
      if (circleRectCollision({ x: player.x, y: player.y, radius: player.radius }, obs)) {
        player.x = oldX;
        player.y = oldY;
        break;
      }
    }
    player.attackCooldown -= deltaTime;
    if (player.attackCooldown <= 0) {
      fireBullet();
      player.attackCooldown = player.attackInterval;
    }
  }

  // 기본 공격: 360도 총알 발사 + [유도탄] 스킬 시 추가 유도 미사일
  // 각 총알은 hitCount를 기록 (최대 타격 수 = player.penetrationCount + 1)
  function fireBullet() {
    const bulletCount = 12;
    for (let i = 0; i < bulletCount; i++) {
      let angle = (i * 2 * Math.PI) / bulletCount;
      let bullet = {
        x: player.x,
        y: player.y,
        radius: 4,
        speed: 5,
        dx: Math.cos(angle),
        dy: Math.sin(angle),
        guided: false,
        hitCount: 0
      };
      bullets.push(bullet);
    }
    if (player.guidedMissileActive) {
      let guidedBullet = {
        x: player.x,
        y: player.y,
        radius: 4,
        speed: 7,
        dx: 0,
        dy: -1,
        guided: true,
        hitCount: 0
      };
      bullets.push(guidedBullet);
    }
  }

  // 총알 업데이트: 유도 미사일은 타겟 추적, 장애물과 충돌 시 제거
  function updateBullets(deltaTime) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      let bullet = bullets[i];
      if (bullet.guided) {
        for (let o = 0; o < obstacles.length; o++) {
          if (circleRectCollision(bullet, obstacles[o])) {
            bullets.splice(i, 1);
            break;
          }
        }
      }
    }
    for (let i = bullets.length - 1; i >= 0; i--) {
      let bullet = bullets[i];
      if (bullet.guided) {
        let target = null;
        let minDist = Infinity;
        for (let m = 0; m < monsters.length; m++) {
          let monster = monsters[m];
          let dx = monster.x - bullet.x;
          let dy = monster.y - bullet.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            minDist = dist;
            target = monster;
          }
        }
        if (target) {
          let desiredDx = target.x - bullet.x;
          let desiredDy = target.y - bullet.y;
          let mag = Math.sqrt(desiredDx * desiredDx + desiredDy * desiredDy);
          bullet.dx = desiredDx / mag;
          bullet.dy = desiredDy / mag;
        }
      }
      bullet.x += bullet.dx * bullet.speed;
      bullet.y += bullet.dy * bullet.speed;
      if (bullet.x < 0 || bullet.x > mapWidth || bullet.y < 0 || bullet.y > mapHeight) {
        bullets.splice(i, 1);
      }
    }
  }

  // 플레이어 그리기 및 HP바
  function drawPlayer() {
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    drawPlayerHPBar();
  }
  function drawPlayerHPBar() {
    const barWidth = 40, barHeight = 6;
    const x = player.x - barWidth / 2;
    const y = player.y + player.radius + 5;
    ctx.fillStyle = '#555';
    ctx.fillRect(x, y, barWidth, barHeight);
    const hpRatio = player.hp / player.maxHp;
    ctx.fillStyle = 'lime';
    ctx.fillRect(x, y, barWidth * hpRatio, barHeight);
    ctx.strokeStyle = 'white';
    ctx.strokeRect(x, y, barWidth, barHeight);
  }

  // 총알 그리기
  function drawBullets() {
    bullets.forEach(bullet => {
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      ctx.fillStyle = bullet.guided ? 'magenta' : 'cyan';
      ctx.fill();
    });
  }

  // 일반 몬스터 생성
  function spawnMonster() {
    const multiplier = 1 + Math.floor(gameTime / 10) * 0.2;
    let monster = {
      x: Math.random() * mapWidth,
      y: Math.random() * mapHeight,
      radius: 12,
      speed: 1 + Math.random(),
      maxHealth: 3 * multiplier,
      health: 3 * multiplier,
      xpReward: 1,
      attack: Math.floor((1 + Math.random() * 2) * multiplier),
      defense: Math.floor(Math.floor(gameTime / 10) * 0.5)
    };
    monsters.push(monster);
  }

  // 보스 생성 (단 한 마리)
  function spawnBoss() {
    const multiplier = 1 + Math.floor(gameTime / 10) * 0.2;
    let boss = {
      x: Math.random() * mapWidth,
      y: Math.random() * mapHeight,
      radius: 25,
      speed: 0.5 + Math.random(),
      maxHealth: 20 * multiplier,
      health: 20 * multiplier,
      xpReward: 5,
      attack: 5 * multiplier,
      defense: 3 * multiplier,
      isBoss: true
    };
    monsters.push(boss);
  }

  // 몬스터 업데이트 (플레이어 방향)
  function updateMonsters(deltaTime) {
    monsters.forEach(monster => {
      let dx = player.x - monster.x;
      let dy = player.y - monster.y;
      let distance = Math.sqrt(dx * dx + dy * dy);
      monster.x += (dx / distance) * monster.speed;
      monster.y += (dy / distance) * monster.speed;
    });
  }

  // 몬스터 그리기 및 HP바
  function drawMonsters() {
    monsters.forEach(monster => {
      ctx.beginPath();
      ctx.arc(monster.x, monster.y, monster.radius, 0, Math.PI * 2);
      ctx.fillStyle = monster.isBoss ? 'purple' : 'green';
      ctx.fill();
      drawMonsterHPBar(monster);
    });
  }
  function drawMonsterHPBar(monster) {
    const barWidth = 30, barHeight = 4;
    const x = monster.x - barWidth / 2;
    const y = monster.y - monster.radius - 10;
    ctx.fillStyle = '#555';
    ctx.fillRect(x, y, barWidth, barHeight);
    const hpRatio = monster.health / monster.maxHealth;
    ctx.fillStyle = 'red';
    ctx.fillRect(x, y, barWidth * hpRatio, barHeight);
    ctx.strokeStyle = 'white';
    ctx.strokeRect(x, y, barWidth, barHeight);
  }

  // 아이템 생성 – XP(노란색) 및 HP(빨간색)
  function spawnItem() {
    const rand = Math.random();
    let item;
    if (rand < 0.7) {
      item = {
        x: Math.random() * mapWidth,
        y: Math.random() * mapHeight,
        radius: 8,
        type: 'xp',
        xpReward: 1
      };
    } else {
      item = {
        x: Math.random() * mapWidth,
        y: Math.random() * mapHeight,
        radius: 8,
        type: 'hp',
        heal: 2
      };
    }
    items.push(item);
  }
  function drawItems() {
    items.forEach(item => {
      ctx.beginPath();
      ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
      ctx.fillStyle = item.type === 'xp' ? 'yellow' : 'red';
      ctx.fill();
    });
  }

  // 충돌 검사
  function checkCollisions(deltaTime) {
    // 0. 유도 미사일 장애물 충돌 체크
    for (let i = bullets.length - 1; i >= 0; i--) {
      let bullet = bullets[i];
      if (bullet.guided) {
        for (let o = 0; o < obstacles.length; o++) {
          if (circleRectCollision(bullet, obstacles[o])) {
            bullets.splice(i, 1);
            break;
          }
        }
      }
    }
    // 1. 총알과 몬스터 충돌
    for (let b = bullets.length - 1; b >= 0; b--) {
      let bullet = bullets[b];
      if (bullet.hitCount === undefined) bullet.hitCount = 0;
      let allowedHits = player.penetrationCount + 1;
      let collided = false;
      for (let m = monsters.length - 1; m >= 0; m--) {
        let monster = monsters[m];
        let dx = bullet.x - monster.x;
        let dy = bullet.y - monster.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < bullet.radius + monster.radius) {
          collided = true;
          let damage = Math.max(player.attack - (monster.defense || 0), 1);
          monster.health -= damage;
          bullet.hitCount++;
          if (monster.health <= 0) {
            player.xp += monster.xpReward;
            monsters.splice(m, 1);
            checkLevelUp();
          }
          if (bullet.hitCount >= allowedHits) break;
        }
      }
      if (collided && bullet.hitCount >= allowedHits) {
        bullets.splice(b, 1);
      }
    }
    // 2. 플레이어와 아이템 충돌
    for (let i = items.length - 1; i >= 0; i--) {
      let item = items[i];
      let dx = player.x - item.x;
      let dy = player.y - item.y;
      let distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < player.radius + item.radius) {
        if (item.type === 'xp') {
          player.xp += item.xpReward;
          checkLevelUp();
        } else if (item.type === 'hp') {
          player.hp = Math.min(player.hp + item.heal, player.maxHp);
        }
        items.splice(i, 1);
      }
    }
    // 3. 플레이어와 몬스터 지속 충돌
    monsters.forEach(monster => {
      let dx = player.x - monster.x;
      let dy = player.y - monster.y;
      let distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < player.radius + monster.radius) {
        let damage = Math.max(monster.attack - player.defense, 1);
        player.hp = Math.max(player.hp - damage * (deltaTime / 1000), 0);
        if (player.hp === 0) gameState = 'gameOver';
      }
    });
  }

  // 레벨업 조건: XP가 xpToLevel 이상이면 레벨업, xpToLevel은 이전 값의 1.8배로 증가
  function checkLevelUp() {
    if (player.xp >= player.xpToLevel) {
      player.level++;
      player.xp = 0;
      player.xpToLevel = Math.floor(player.xpToLevel * 1.8);
      gameState = 'levelUp';
      showLevelUpOverlay();
    }
  }

  // 레벨업 오버레이 및 스킬 버튼 동적 생성 (가중치 기반 선택)
  const levelUpOverlay = document.getElementById('levelUpOverlay');
  const skillButtonsContainer = document.getElementById('skillButtonsContainer');
  function showLevelUpOverlay() {
    const availableSkills = skillPool.filter(skill => {
      if (!skill.repeatable) {
        if (skill.id === 'guidedMissile' && player.guidedMissileActive) return false;
      }
      return true;
    });
    const selectedSkills = selectWeightedRandom(availableSkills, 2);
    skillButtonsContainer.innerHTML = '';
    selectedSkills.forEach(skill => {
      const btn = document.createElement('button');
      btn.className = 'skillButton';
      btn.dataset.skill = skill.id;
      btn.innerText = skill.name;
      btn.addEventListener('click', () => {
        skill.apply();
        hideLevelUpOverlay();
      });
      skillButtonsContainer.appendChild(btn);
    });
    levelUpOverlay.style.display = 'block';
  }
  function hideLevelUpOverlay() {
    levelUpOverlay.style.display = 'none';
    gameState = 'playing';
  }
  function selectWeightedRandom(arr, n) {
    let selected = [];
    let pool = arr.slice();
    for (let i = 0; i < n && pool.length > 0; i++) {
      let totalWeight = pool.reduce((sum, skill) => sum + (skill.weight || 1), 0);
      let r = Math.random() * totalWeight;
      let cumulative = 0;
      let chosenIndex = 0;
      for (let j = 0; j < pool.length; j++) {
        cumulative += (pool[j].weight || 1);
        if (r < cumulative) {
          chosenIndex = j;
          break;
        }
      }
      selected.push(pool.splice(chosenIndex, 1)[0]);
    }
    return selected;
  }

  let lastMonsterSpawn = 0;
  let lastItemSpawn = 0;
  let lastObstacleSpawnTime = 0;
  let lastTime = 0;

  // 카메라: 플레이어를 중심으로 보이도록 (단, 맵 경계 내에서)
  function updateCamera() {
    camera.x = clamp(player.x - canvas.width / 2, 0, mapWidth - canvas.width);
    camera.y = clamp(player.y - canvas.height / 2, 0, mapHeight - canvas.height);
  }

  // HUD 그리기 – 화면 고정 좌표에서
  function drawHUD() {
    ctx.save();
    ctx.resetTransform();
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Level: ${player.level}  XP: ${player.xp}/${player.xpToLevel}`, 10, 20);
    ctx.fillText(`Time: ${Math.floor(gameTime)} s`, 10, 40);
    ctx.fillText(`HP: ${Math.floor(player.hp)}/${player.maxHp}`, 10, 60);
    ctx.fillText(`ATK: ${player.attack}`, 10, 80);
    ctx.fillText(`DEF: ${player.defense}`, 10, 100);
    ctx.fillText(`ATK SPD: ${(1000 / player.attackInterval).toFixed(1)}`, 10, 120);
    ctx.fillText(`이동속도: ${player.speed.toFixed(1)}`, 10, 140);
    ctx.fillText(`관통: ${player.penetrationCount}`, 10, 160);
    ctx.restore();
  }

  // 메인 게임 루프
  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    
    if (gameState === 'playing') {
      gameTime += deltaTime / 1000;
      updatePlayer(deltaTime);
      updateBullets(deltaTime);
      updateMonsters(deltaTime);
      checkCollisions(deltaTime);
      updateObstacles(deltaTime);
      updateCamera();
      
      let spawnInterval = Math.max(1500 - gameTime * 20, 500);
      if (timestamp - lastMonsterSpawn > spawnInterval) {
        let spawnCount = Math.floor(gameTime / 10) + 1;
        for (let i = 0; i < spawnCount; i++) {
          spawnMonster();
        }
        lastMonsterSpawn = timestamp;
      }
      if (timestamp - lastItemSpawn > 5000) {
        spawnItem();
        lastItemSpawn = timestamp;
      }
      let currentBossThreshold = Math.floor(gameTime / 10);
      const bossExists = monsters.some(monster => monster.isBoss);
      if (currentBossThreshold > lastBossThreshold && !bossExists) {
        spawnBoss();
        lastBossThreshold = currentBossThreshold;
      }
      if (timestamp - lastObstacleSpawnTime > 3000) {
        if (obstacles.length < 3 && Math.random() < 0.5) {
          spawnObstacle();
        }
        lastObstacleSpawnTime = timestamp;
      }
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    // 카메라 변환: 전체 맵 좌표에서 보이는 영역만 그리기
    ctx.translate(-camera.x, -camera.y);
    // 전체 맵에 배경색 채우기 (예: 어두운 회색)
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, mapWidth, mapHeight);
    drawPlayer();
    drawBullets();
    drawMonsters();
    drawItems();
    drawObstacles();
    ctx.restore();
    drawHUD();
    
    if (gameState === 'gameOver') {
      ctx.save();
      ctx.resetTransform();
      ctx.fillStyle = 'red';
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText("Game Over", canvas.width/2, canvas.height/2 - 20);
      ctx.font = '24px Arial';
      ctx.fillText(`Score: ${Math.floor(gameTime)} s`, canvas.width/2, canvas.height/2 + 20);
      ctx.restore();
      return;
    }
    
    requestAnimationFrame(gameLoop);
  }
  requestAnimationFrame(gameLoop);