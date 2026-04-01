(() => {
'use strict';

// ===================== CONFIGURATION =====================
const COLS = 10;
const ROWS = 26;
const CELL = 24;
const CANVAS_W = 540;
const CANVAS_H = 700;
const GRID_X = 24;
const GRID_Y = 38;
const GRID_W = COLS * CELL;
const GRID_H = ROWS * CELL;
const HUD_X = GRID_X + GRID_W + 28;
const HUD_Y = GRID_Y;

const INITIAL_TETRIS_INTERVAL = 800;
const MIN_TETRIS_INTERVAL = 80;
const TETRIS_SPEED_DECREASE = 50;
const LINES_PER_LEVEL = 10;
const FOOD_INTERVAL = 6000;
const INITIAL_SNAKE_LEN = 4;
const LINE_SCORES = [0, 100, 300, 500, 800];
const FOOD_SCORE = 50;

const DIFFICULTIES = {
  EASY:   { label: 'EASY',   interval: 280, color: '#00ff60' },
  MEDIUM: { label: 'MEDIUM', interval: 200, color: '#ffee00' },
  HARD:   { label: 'HARD',   interval: 140, color: '#ff3030' }
};

// ===================== COLORS =====================
const C = {
  BG:          '#08080c',
  GRID_BG:     '#0c0c18',
  GRID_LINE:   '#161628',
  GRID_BORDER: '#00cccc',
  SNAKE_HEAD:  '#00ff41',
  SNAKE_B1:    '#00dd33',
  SNAKE_B2:    '#00aa28',
  FOOD:        '#ff0050',
  TEXT:        '#ffffff',
  DIM:         '#555570',
  ACCENT:      '#00ffee',
  ACCENT2:     '#ff00aa',
  GLOW:        '#00ffee',
  OVERLAY:     'rgba(4,4,8,0.82)',
  SCAN:        'rgba(0,0,0,0.06)',
  I: '#00f0f0', O: '#f0f000', T: '#a000f0',
  S: '#00f060', Z: '#f03030', J: '#3030f0', L: '#f0a000'
};

// ===================== TETROMINO SHAPES =====================
const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]]
};
const TYPES = Object.keys(SHAPES);

// ===================== SCREENS =====================
const SCR = { HOME: 0, RULES: 1, PLAY: 2, OVER: 3, PAUSE: 4 };

// ===================== HELPERS =====================
function rotateCW(m) {
  const n = m.length;
  return Array.from({length: n}, (_, i) =>
    Array.from({length: n}, (_, j) => m[n - 1 - j][i])
  );
}

function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.random() * (i + 1) | 0;
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ===================== GAME =====================
class Game {
  constructor(cvs) {
    this.cvs = cvs;
    this.ctx = cvs.getContext('2d');
    cvs.width = CANVAS_W;
    cvs.height = CANVAS_H;
    this.screen = SCR.HOME;
    this.animT = 0;
    this.highScore = parseInt(localStorage.getItem('snaketris_hi') || '0', 10);
    this.difficulty = localStorage.getItem('snaketris_diff') || 'MEDIUM';
    if (!DIFFICULTIES[this.difficulty]) this.difficulty = 'MEDIUM';
    this.snakeInterval = DIFFICULTIES[this.difficulty].interval;
    this.initHomeAnim();
    this.resetGame();
    this.setupInput();
  }

  // -------------------- Grid --------------------
  emptyGrid() {
    return Array.from({length: ROWS}, () => Array(COLS).fill(0));
  }

  // -------------------- Reset --------------------
  resetGame() {
    this.grid = this.emptyGrid();
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.gameOverReason = '';

    const sy = ROWS - 4;
    this.snake = [];
    for (let i = 0; i < INITIAL_SNAKE_LEN; i++)
      this.snake.push({x: 3 - i, y: sy});
    this.snakeDir  = {x: 1, y: 0};
    this.pendDir   = {x: 1, y: 0};
    this.snakeTimer = 0;

    this.bag = [];
    this.nextType = this.pullBag();
    this.piece = null;
    this.spawnPiece();
    this.tetTimer = 0;
    this.tetSpeed = INITIAL_TETRIS_INTERVAL;

    this.food = null;
    this.foodTimer = 2500;

    this.survTimer = 0;
    this.flashRows = [];
    this.flashTimer = 0;
  }

  // -------------------- Difficulty --------------------
  setDifficulty(d) {
    this.difficulty = d;
    this.snakeInterval = DIFFICULTIES[d].interval;
    localStorage.setItem('snaketris_diff', d);
  }

  // -------------------- Bag / Spawn --------------------
  pullBag() {
    if (!this.bag.length) this.bag = shuffle([...TYPES]);
    return this.bag.pop();
  }

  spawnPiece() {
    const type = this.nextType;
    this.nextType = this.pullBag();
    const shape = SHAPES[type].map(r => [...r]);
    const x = Math.floor((COLS - shape[0].length) / 2);
    this.piece = {type, shape, x, y: 0};
    if (!this.canBeAt(shape, x, 0)) this.die('BOARD FULL');
  }

  // -------------------- Piece Helpers --------------------
  pieceCells(p) {
    const out = [];
    if (!p) return out;
    for (let r = 0; r < p.shape.length; r++)
      for (let c = 0; c < p.shape[r].length; c++)
        if (p.shape[r][c]) out.push({x: p.x + c, y: p.y + r});
    return out;
  }

  canBeAt(shape, px, py) {
    for (let r = 0; r < shape.length; r++)
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const gx = px + c, gy = py + r;
        if (gx < 0 || gx >= COLS || gy >= ROWS) return false;
        if (gy < 0) continue;
        if (this.grid[gy][gx]) return false;
        if (this.isSnake(gx, gy)) return false;
      }
    return true;
  }

  isSnakeHead(x, y) {
    return this.snake.length && this.snake[0].x === x && this.snake[0].y === y;
  }
  isSnakeBody(x, y) {
    for (let i = 1; i < this.snake.length; i++)
      if (this.snake[i].x === x && this.snake[i].y === y) return true;
    return false;
  }
  isSnake(x, y) {
    return this.snake.some(s => s.x === x && s.y === y);
  }
  isPieceAt(x, y) {
    return this.pieceCells(this.piece).some(c => c.x === x && c.y === y);
  }

  // -------------------- Piece Down Collision Check --------------------
  checkPieceDown() {
    if (!this.piece) return 'ok';
    const ny = this.piece.y + 1;
    let bodyBlock = false;
    for (let r = 0; r < this.piece.shape.length; r++)
      for (let c = 0; c < this.piece.shape[r].length; c++) {
        if (!this.piece.shape[r][c]) continue;
        const gx = this.piece.x + c, gy = ny + r;
        if (gy >= ROWS) return 'solid';
        if (gy < 0) continue;
        if (this.grid[gy][gx]) return 'solid';
        if (this.isSnakeHead(gx, gy)) return 'head';
        if (this.isSnakeBody(gx, gy)) bodyBlock = true;
      }
    return bodyBlock ? 'body' : 'ok';
  }

  // -------------------- Piece Movement --------------------
  movePieceH(dx) {
    if (!this.piece || dx === 0) return false;
    const nx = this.piece.x + dx;
    for (let r = 0; r < this.piece.shape.length; r++)
      for (let c = 0; c < this.piece.shape[r].length; c++) {
        if (!this.piece.shape[r][c]) continue;
        const gx = nx + c, gy = this.piece.y + r;
        if (gx < 0 || gx >= COLS || gy >= ROWS) return false;
        if (gy < 0) continue;
        if (this.grid[gy][gx]) return false;
        if (this.isSnake(gx, gy)) return false;
      }
    this.piece.x = nx;
    return true;
  }

  rotatePiece() {
    if (!this.piece || this.piece.type === 'O') return;
    const rot = rotateCW(this.piece.shape);
    for (const kick of [0, -1, 1, -2, 2]) {
      if (this.canBeAt(rot, this.piece.x + kick, this.piece.y)) {
        this.piece.shape = rot;
        this.piece.x += kick;
        return;
      }
    }
  }

  lockPiece() {
    if (!this.piece) return;
    const color = C[this.piece.type];
    for (const {x, y} of this.pieceCells(this.piece))
      if (y >= 0 && y < ROWS) this.grid[y][x] = color;
    this.clearLines();
    if (this.screen === SCR.PLAY) this.spawnPiece();
  }

  hardDrop() {
    if (!this.piece) return;
    let d = 0;
    while (true) {
      const check = this.checkPieceDown();
      if (check === 'head') { this.die('CRUSHED BY BLOCK'); return; }
      if (check !== 'ok') break;
      this.piece.y++;
      d++;
    }
    this.score += d * 2;
    if (this.checkPieceDown() === 'solid') this.lockPiece();
    this.tetTimer = 0;
  }

  ghostY() {
    if (!this.piece) return 0;
    let gy = this.piece.y;
    while (this.canBeAt(this.piece.shape, this.piece.x, gy + 1)) gy++;
    return gy;
  }

  // -------------------- Line Clearing --------------------
  clearLines() {
    let cleared = 0;
    const flashAt = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (this.grid[r].every(c => c !== 0)) {
        flashAt.push(r);
        this.grid.splice(r, 1);
        this.grid.unshift(Array(COLS).fill(0));
        for (const seg of this.snake)
          if (seg.y < r) seg.y++;
        if (this.food && this.food.y < r) this.food.y++;
        cleared++;
        r++;
      }
    }
    if (cleared) {
      this.flashRows = flashAt;
      this.flashTimer = 300;
      this.lines += cleared;
      this.score += LINE_SCORES[clamp(cleared, 0, 4)] * this.level;
      this.level = Math.floor(this.lines / LINES_PER_LEVEL) + 1;
      this.tetSpeed = Math.max(MIN_TETRIS_INTERVAL,
        INITIAL_TETRIS_INTERVAL - (this.level - 1) * TETRIS_SPEED_DECREASE);
      const tail = this.snake[this.snake.length - 1];
      for (let i = 0; i < cleared; i++)
        this.snake.push({x: tail.x, y: tail.y});
    }
  }

  // -------------------- Snake --------------------
  updateSnake() {
    if (!this.snake.length) return;
    const opp = (this.snakeDir.x === -this.pendDir.x && this.pendDir.x !== 0) ||
                (this.snakeDir.y === -this.pendDir.y && this.pendDir.y !== 0);
    if (!opp) this.snakeDir = {...this.pendDir};

    const head = this.snake[0];
    const nx = head.x + this.snakeDir.x;
    const ny = head.y + this.snakeDir.y;

    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) { this.die('HIT WALL'); return; }
    for (let i = 1; i < this.snake.length; i++)
      if (this.snake[i].x === nx && this.snake[i].y === ny) { this.die('ATE ITSELF'); return; }
    if (this.grid[ny][nx])       { this.die('HIT BLOCK'); return; }
    if (this.isPieceAt(nx, ny))  { this.die('HIT FALLING BLOCK'); return; }

    this.snake.unshift({x: nx, y: ny});

    if (this.food && this.food.x === nx && this.food.y === ny) {
      this.score += FOOD_SCORE;
      this.food = null;
      this.foodTimer = FOOD_INTERVAL;
    } else {
      this.snake.pop();
    }
  }

  // -------------------- Food --------------------
  spawnFood() {
    const open = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        if (this.grid[r][c]) continue;
        if (this.isSnake(c, r)) continue;
        if (this.isPieceAt(c, r)) continue;
        if (r < 4) continue;
        open.push({x: c, y: r});
      }
    if (open.length) this.food = open[Math.random() * open.length | 0];
  }

  // -------------------- Game Over --------------------
  die(reason) {
    this.gameOverReason = reason;
    this.screen = SCR.OVER;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('snaketris_hi', String(this.highScore));
    }
  }

  // -------------------- Input --------------------
  setupInput() {
    document.addEventListener('keydown', e => {
      const k = e.key;
      switch (this.screen) {
        case SCR.HOME:
          if (k === 'Enter') { this.resetGame(); this.screen = SCR.PLAY; }
          if (k === 'r' || k === 'R') this.screen = SCR.RULES;
          if (k === '1') this.setDifficulty('EASY');
          if (k === '2') this.setDifficulty('MEDIUM');
          if (k === '3') this.setDifficulty('HARD');
          break;
        case SCR.RULES:
          if (k === 'Escape' || k === 'Backspace') this.screen = SCR.HOME;
          break;
        case SCR.PLAY:
          e.preventDefault();
          if (k === 'w' || k === 'W') this.pendDir = {x: 0, y:-1};
          if (k === 'a' || k === 'A') this.pendDir = {x:-1, y: 0};
          if (k === 's' || k === 'S') this.pendDir = {x: 0, y: 1};
          if (k === 'd' || k === 'D') this.pendDir = {x: 1, y: 0};
          if (k === 'ArrowLeft')  this.movePieceH(-1);
          if (k === 'ArrowRight') this.movePieceH( 1);
          if (k === 'ArrowUp')    this.rotatePiece();
          if (k === 'ArrowDown') {
            const chk = this.checkPieceDown();
            if (chk === 'ok') { this.piece.y++; this.score++; }
            else if (chk === 'head') this.die('CRUSHED BY BLOCK');
            this.tetTimer = 0;
          }
          if (k === ' ') this.hardDrop();
          if (k === 'p' || k === 'P') this.screen = SCR.PAUSE;
          break;
        case SCR.PAUSE:
          if (k === 'p' || k === 'P' || k === 'Escape') this.screen = SCR.PLAY;
          break;
        case SCR.OVER:
          if (k === 'Enter') { this.resetGame(); this.screen = SCR.PLAY; }
          if (k === 'Escape') this.screen = SCR.HOME;
          break;
      }
    });
  }

  // -------------------- Loop --------------------
  start() {
    this.lastT = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }

  loop(now) {
    const dt = clamp(now - this.lastT, 0, 100);
    this.lastT = now;
    this.animT += dt;

    if (this.screen === SCR.PLAY)  this.update(dt);
    if (this.screen === SCR.HOME)  this.updateHome(dt);
    this.render();
    requestAnimationFrame(t => this.loop(t));
  }

  update(dt) {
    this.snakeTimer += dt;
    if (this.snakeTimer >= this.snakeInterval) {
      this.snakeTimer -= this.snakeInterval;
      this.updateSnake();
      if (this.screen !== SCR.PLAY) return;
    }

    this.tetTimer += dt;
    if (this.tetTimer >= this.tetSpeed) {
      this.tetTimer -= this.tetSpeed;
      const check = this.checkPieceDown();
      if (check === 'head') {
        this.die('CRUSHED BY BLOCK');
      } else if (check === 'ok') {
        this.piece.y++;
      } else if (check === 'solid') {
        this.lockPiece();
      }
      if (this.screen !== SCR.PLAY) return;
    }

    if (!this.food) {
      this.foodTimer -= dt;
      if (this.foodTimer <= 0) { this.spawnFood(); this.foodTimer = FOOD_INTERVAL; }
    } else {
      if (this.grid[this.food.y] && this.grid[this.food.y][this.food.x]) {
        this.food = null;
        this.foodTimer = FOOD_INTERVAL;
      }
    }

    if (this.flashTimer > 0) this.flashTimer -= dt;

    this.survTimer += dt;
    if (this.survTimer >= 1000) { this.survTimer -= 1000; this.score++; }
  }

  // -------------------- Home Animation --------------------
  initHomeAnim() {
    this.homeFalling = [];
    for (let i = 0; i < 30; i++)
      this.homeFalling.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        sp: 20 + Math.random() * 50,
        t: TYPES[Math.random() * TYPES.length | 0],
        sz: 14 + Math.random() * 14
      });
  }

  updateHome(dt) {
    for (const b of this.homeFalling) {
      b.y += b.sp * dt / 1000;
      if (b.y > CANVAS_H + 40) { b.y = -40; b.x = Math.random() * CANVAS_W; }
    }
  }

  // ==================== RENDERING ====================
  render() {
    const ctx = this.ctx;
    ctx.fillStyle = C.BG;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    switch (this.screen) {
      case SCR.HOME:  this.drawHome();  break;
      case SCR.RULES: this.drawRules(); break;
      case SCR.PLAY:  this.drawGame();  break;
      case SCR.PAUSE: this.drawGame(); this.drawPause(); break;
      case SCR.OVER:  this.drawGame(); this.drawGameOver(); break;
    }
    this.drawScanlines();
  }

  drawScanlines() {
    const ctx = this.ctx;
    ctx.fillStyle = C.SCAN;
    for (let y = 0; y < CANVAS_H; y += 3) ctx.fillRect(0, y, CANVAS_W, 1);
  }

  // ---------- HOME ----------
  drawHome() {
    const ctx = this.ctx;

    ctx.globalAlpha = 0.3;
    for (const b of this.homeFalling) {
      ctx.fillStyle = C[b.t];
      ctx.shadowColor = C[b.t];
      ctx.shadowBlur = 8;
      ctx.fillRect(b.x - b.sz / 2, b.y - b.sz / 2, b.sz, b.sz);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    const vg = ctx.createRadialGradient(CANVAS_W/2, CANVAS_H/2, 80,
      CANVAS_W/2, CANVAS_H/2, CANVAS_W * 0.72);
    vg.addColorStop(0, 'transparent');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = C.GLOW;
    ctx.shadowBlur = 50;
    ctx.fillStyle = C.ACCENT;
    ctx.font = '48px "Press Start 2P",monospace';
    ctx.fillText('POLY', CANVAS_W/2, 120);
    ctx.fillText('SNAKE', CANVAS_W/2, 172);
    ctx.fillText('POLY', CANVAS_W/2, 120);
    ctx.fillText('SNAKE', CANVAS_W/2, 172);
    ctx.shadowBlur = 0;

    ctx.fillStyle = C.DIM;
    ctx.font = '9px "Press Start 2P",monospace';
    ctx.fillText('SNAKE  \u00d7  TETRIS  MASHUP', CANVAS_W/2, 215);

    ctx.strokeStyle = C.ACCENT;
    ctx.lineWidth = 2;
    ctx.shadowColor = C.ACCENT;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(CANVAS_W/2 - 180, 238);
    ctx.lineTo(CANVAS_W/2 + 180, 238);
    ctx.stroke();
    ctx.shadowBlur = 0;

    const blink = Math.sin(this.animT / 250) > 0;
    if (blink) {
      ctx.fillStyle = C.TEXT;
      ctx.shadowColor = C.TEXT;
      ctx.shadowBlur = 10;
      ctx.font = '13px "Press Start 2P",monospace';
      ctx.fillText('PRESS ENTER TO PLAY', CANVAS_W/2, 310);
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = C.DIM;
    ctx.font = '10px "Press Start 2P",monospace';
    ctx.fillText('PRESS  R  FOR RULES', CANVAS_W/2, 370);

    if (this.highScore > 0) {
      ctx.fillStyle = '#f0a000';
      ctx.font = '9px "Press Start 2P",monospace';
      ctx.fillText('HIGH SCORE: ' + this.highScore, CANVAS_W/2, 420);
    }

    // Difficulty selector
    const diff = DIFFICULTIES[this.difficulty];
    ctx.fillStyle = C.DIM;
    ctx.font = '8px "Press Start 2P",monospace';
    ctx.fillText('1=EASY   2=MED   3=HARD', CANVAS_W/2, 460);
    ctx.fillStyle = diff.color;
    ctx.shadowColor = diff.color;
    ctx.shadowBlur = 8;
    ctx.font = '11px "Press Start 2P",monospace';
    ctx.fillText('SPEED: ' + diff.label, CANVAS_W/2, 485);
    ctx.shadowBlur = 0;

    // Decorative snake - bigger, with fangs and eyes
    const segs = 12;
    const segSz = 16;
    const spacing = segSz + 3;
    const totalW = segs * spacing;
    const baseX = CANVAS_W / 2 - totalW / 2;
    const baseY = 560;

    for (let i = 0; i < segs; i++) {
      const isHead = (i === segs - 1);
      const sx = baseX + i * spacing;
      const wave = Math.sin(this.animT / 250 + i * 0.5) * 13;
      const sy = baseY + wave;

      if (isHead) {
        const hw = 26, hh = 22;
        ctx.fillStyle = C.SNAKE_HEAD;
        ctx.shadowColor = C.SNAKE_HEAD;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(sx, sy + 2);
        ctx.lineTo(sx + hw - 6, sy);
        ctx.lineTo(sx + hw, sy + hh * 0.3);
        ctx.lineTo(sx + hw + 2, sy + hh / 2);
        ctx.lineTo(sx + hw, sy + hh * 0.7);
        ctx.lineTo(sx + hw - 6, sy + hh);
        ctx.lineTo(sx, sy + hh - 2);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Eyes
        ctx.fillStyle = '#ffee00';
        ctx.beginPath(); ctx.arc(sx + hw - 11, sy + 5, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sx + hw - 11, sy + hh - 5, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(sx + hw - 9, sy + 5, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sx + hw - 9, sy + hh - 5, 2, 0, Math.PI * 2); ctx.fill();

        // Fangs
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(sx + hw - 1, sy + hh / 2 - 5);
        ctx.lineTo(sx + hw + 7, sy + hh / 2 - 2);
        ctx.lineTo(sx + hw, sy + hh / 2 - 1);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(sx + hw - 1, sy + hh / 2 + 5);
        ctx.lineTo(sx + hw + 7, sy + hh / 2 + 2);
        ctx.lineTo(sx + hw, sy + hh / 2 + 1);
        ctx.closePath();
        ctx.fill();

        // Forked tongue
        if (Math.sin(this.animT / 180) > 0.2) {
          ctx.strokeStyle = '#ff2222';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(sx + hw + 2, sy + hh / 2);
          ctx.lineTo(sx + hw + 12, sy + hh / 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(sx + hw + 10, sy + hh / 2);
          ctx.lineTo(sx + hw + 15, sy + hh / 2 - 4);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(sx + hw + 10, sy + hh / 2);
          ctx.lineTo(sx + hw + 15, sy + hh / 2 + 4);
          ctx.stroke();
        }
      } else {
        const taper = i === 0 ? 0.45 : (i === 1 ? 0.65 : (i === 2 ? 0.82 : 1.0));
        const sz = segSz * taper;
        const off = (segSz - sz) / 2;
        ctx.globalAlpha = 0.88;
        ctx.fillStyle = i % 2 ? C.SNAKE_B1 : C.SNAKE_B2;
        ctx.fillRect(sx + off, sy + off, sz, sz);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(sx + off, sy + off, sz, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(sx + off + sz * 0.25, sy + off + sz * 0.25, sz * 0.5, sz * 0.5);
        ctx.globalAlpha = 1;
      }
    }

    ctx.fillStyle = '#333';
    ctx.font = '7px "Press Start 2P",monospace';
    ctx.fillText('A RETRO ARCADE MASHUP', CANVAS_W/2, CANVAS_H - 30);
    ctx.restore();
  }

  // ---------- RULES ----------
  drawRules() {
    const ctx = this.ctx;
    ctx.save();

    // Background panel for readability
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(30, 85, CANVAS_W - 60, CANVAS_H - 145);
    ctx.strokeStyle = 'rgba(0, 255, 238, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(30, 85, CANVAS_W - 60, CANVAS_H - 145);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = C.ACCENT;
    ctx.shadowBlur = 18;
    ctx.fillStyle = C.ACCENT;
    ctx.font = '24px "Press Start 2P",monospace';
    ctx.fillText('HOW TO PLAY', CANVAS_W/2, 50);
    ctx.shadowBlur = 0;

    ctx.strokeStyle = C.ACCENT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(50, 78);
    ctx.lineTo(CANVAS_W - 50, 78);
    ctx.stroke();

    ctx.textAlign = 'left';
    const lx = 52;
    let y = 120;

    const section = (title) => {
      ctx.fillStyle = C.ACCENT2;
      ctx.font = '13px "Press Start 2P",monospace';
      ctx.fillText(title, lx, y);
      y += 36;
    };
    const line = (txt, color) => {
      ctx.fillStyle = color || C.TEXT;
      ctx.font = '10px "Press Start 2P",monospace';
      ctx.fillText(txt, lx + 16, y);
      y += 26;
    };
    const gap = (h) => { y += h || 12; };

    section('CONTROLS');
    line('SNAKE ........ W A S D');
    line('TETRIS ....... ARROW KEYS');
    gap(4);
    line('\u2190 \u2192  Move    \u2191  Rotate', C.DIM);
    line('\u2193  Soft drop   SPACE  Hard drop', C.DIM);
    gap(4);
    line('P  Pause     ESC  Menu', C.DIM);
    gap(18);

    section('RULES');
    line('Both games share one board!');
    gap(6);
    line('Snake HEAD hits any block');
    line('  = GAME OVER', C.ACCENT2);
    gap(6);
    line('Blocks can rest on the');
    line('snake body temporarily.');
    line('They resume falling when');
    line('the snake moves away!');
    gap(6);
    line('Block falls on snake HEAD');
    line('  = GAME OVER', C.ACCENT2);
    gap(6);
    line('Clear full rows to score!');
    line('Eat food to grow snake.', C.FOOD);

    ctx.textAlign = 'center';
    const blink = Math.sin(this.animT / 500) > 0;
    if (blink) {
      ctx.fillStyle = C.DIM;
      ctx.font = '10px "Press Start 2P",monospace';
      ctx.fillText('PRESS ESC TO GO BACK', CANVAS_W/2, CANVAS_H - 40);
    }
    ctx.restore();
  }

  // ---------- GAME ----------
  drawGame() {
    const ctx = this.ctx;

    ctx.fillStyle = C.GRID_BG;
    ctx.fillRect(GRID_X, GRID_Y, GRID_W, GRID_H);

    ctx.strokeStyle = C.GRID_LINE;
    ctx.lineWidth = 0.5;
    for (let c = 0; c <= COLS; c++) {
      const x = GRID_X + c * CELL;
      ctx.beginPath(); ctx.moveTo(x, GRID_Y); ctx.lineTo(x, GRID_Y + GRID_H); ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      const y = GRID_Y + r * CELL;
      ctx.beginPath(); ctx.moveTo(GRID_X, y); ctx.lineTo(GRID_X + GRID_W, y); ctx.stroke();
    }

    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (this.grid[r][c])
          this.drawBlock(GRID_X + c * CELL, GRID_Y + r * CELL, this.grid[r][c]);

    if (this.piece && this.screen === SCR.PLAY) {
      const gy = this.ghostY();
      if (gy !== this.piece.y) {
        ctx.globalAlpha = 0.18;
        for (let r = 0; r < this.piece.shape.length; r++)
          for (let c = 0; c < this.piece.shape[r].length; c++)
            if (this.piece.shape[r][c] && gy + r >= 0)
              this.drawBlock(GRID_X + (this.piece.x+c)*CELL,
                GRID_Y + (gy+r)*CELL, C[this.piece.type]);
        ctx.globalAlpha = 1;
      }
    }

    if (this.piece)
      for (let r = 0; r < this.piece.shape.length; r++)
        for (let c = 0; c < this.piece.shape[r].length; c++)
          if (this.piece.shape[r][c] && this.piece.y + r >= 0)
            this.drawBlock(GRID_X + (this.piece.x+c)*CELL,
              GRID_Y + (this.piece.y+r)*CELL, C[this.piece.type]);

    for (let i = this.snake.length - 1; i >= 0; i--) {
      const s = this.snake[i];
      const px = GRID_X + s.x * CELL;
      const py = GRID_Y + s.y * CELL;
      if (i === 0) {
        ctx.fillStyle = C.SNAKE_HEAD;
        ctx.shadowColor = C.SNAKE_HEAD;
        ctx.shadowBlur = 10;
        ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#001a00';
        const d = this.snakeDir;
        const cx = px + CELL/2, cy = py + CELL/2;
        const ex = d.x * 4, ey = d.y * 4;
        const perpX = d.y, perpY = d.x;
        ctx.fillRect(cx + ex + perpX*4 - 2, cy + ey + perpY*4 - 2, 4, 4);
        ctx.fillRect(cx + ex - perpX*4 - 2, cy + ey - perpY*4 - 2, 4, 4);
      } else {
        ctx.fillStyle = i % 2 ? C.SNAKE_B1 : C.SNAKE_B2;
        ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(px + 2, py + 2, CELL - 4, 2);
      }
    }

    if (this.food) {
      const fx = GRID_X + this.food.x * CELL + CELL / 2;
      const fy = GRID_Y + this.food.y * CELL + CELL / 2;
      const pulse = Math.sin(this.animT / 180) * 2.5 + 6;
      ctx.shadowColor = C.FOOD;
      ctx.shadowBlur = 14;
      ctx.fillStyle = C.FOOD;
      ctx.beginPath();
      ctx.arc(fx, fy, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (this.flashTimer > 0) {
      const alpha = this.flashTimer / 300;
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.6})`;
      for (const row of this.flashRows)
        ctx.fillRect(GRID_X, GRID_Y + row * CELL, GRID_W, CELL);
    }

    ctx.strokeStyle = C.GRID_BORDER;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = C.GRID_BORDER;
    ctx.shadowBlur = 12;
    ctx.strokeRect(GRID_X - 1, GRID_Y - 1, GRID_W + 2, GRID_H + 2);
    ctx.shadowBlur = 0;

    this.drawHUD();

    const vg = this.ctx.createRadialGradient(
      GRID_X + GRID_W / 2, GRID_Y + GRID_H / 2, GRID_H * 0.35,
      GRID_X + GRID_W / 2, GRID_Y + GRID_H / 2, GRID_H * 0.75);
    vg.addColorStop(0, 'transparent');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  drawBlock(x, y, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 1, y + 1, CELL - 2, 3);
    ctx.fillRect(x + 1, y + 1, 3, CELL - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 1, y + CELL - 4, CELL - 2, 3);
    ctx.fillRect(x + CELL - 4, y + 1, 3, CELL - 2);
  }

  drawHUD() {
    const ctx = this.ctx;
    const x = HUD_X;
    let y = HUD_Y + 8;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const label = (txt) => {
      ctx.fillStyle = C.ACCENT;
      ctx.font = '9px "Press Start 2P",monospace';
      ctx.fillText(txt, x, y);
      y += 20;
    };
    const value = (txt, col) => {
      ctx.fillStyle = col || C.TEXT;
      ctx.font = '13px "Press Start 2P",monospace';
      ctx.fillText(txt, x, y);
      y += 32;
    };

    label('SCORE');
    value(String(this.score).padStart(7, '0'));
    label('LEVEL');
    value(String(this.level));
    label('LINES');
    value(String(this.lines));

    label('NEXT');
    if (this.nextType) {
      const sh = SHAPES[this.nextType];
      const pc = 15;
      const ox = x + 8;
      for (let r = 0; r < sh.length; r++)
        for (let c = 0; c < sh[r].length; c++)
          if (sh[r][c]) {
            ctx.fillStyle = C[this.nextType];
            ctx.fillRect(ox + c * pc, y + r * pc, pc - 1, pc - 1);
          }
      y += sh.length * pc + 20;
    }

    label('LENGTH');
    value(String(this.snake.length), C.SNAKE_HEAD);

    const diff = DIFFICULTIES[this.difficulty];
    ctx.fillStyle = diff.color;
    ctx.font = '7px "Press Start 2P",monospace';
    ctx.fillText(diff.label, x, y);
    y += 18;

    ctx.fillStyle = '#333';
    ctx.font = '7px "Press Start 2P",monospace';
    const by = GRID_Y + GRID_H - 56;
    ctx.fillText('WASD : SNAKE', x, by);
    ctx.fillText('ARROWS : TETRIS', x, by + 16);
    ctx.fillText('P : PAUSE', x, by + 32);
    ctx.fillText('SPACE : DROP', x, by + 48);
    ctx.restore();
  }

  // ---------- PAUSE ----------
  drawPause() {
    const ctx = this.ctx;
    ctx.fillStyle = C.OVERLAY;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = C.ACCENT;
    ctx.shadowBlur = 24;
    ctx.fillStyle = C.ACCENT;
    ctx.font = '30px "Press Start 2P",monospace';
    ctx.fillText('PAUSED', CANVAS_W/2, CANVAS_H/2 - 20);
    ctx.shadowBlur = 0;
    const blink = Math.sin(this.animT / 400) > 0;
    if (blink) {
      ctx.fillStyle = C.DIM;
      ctx.font = '10px "Press Start 2P",monospace';
      ctx.fillText('PRESS P TO RESUME', CANVAS_W/2, CANVAS_H/2 + 40);
    }
    ctx.restore();
  }

  // ---------- GAME OVER ----------
  drawGameOver() {
    const ctx = this.ctx;
    ctx.fillStyle = C.OVERLAY;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = '#ff0044';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ff0044';
    ctx.font = '30px "Press Start 2P",monospace';
    ctx.fillText('GAME OVER', CANVAS_W/2, CANVAS_H/2 - 90);
    ctx.shadowBlur = 0;

    ctx.fillStyle = C.DIM;
    ctx.font = '8px "Press Start 2P",monospace';
    ctx.fillText(this.gameOverReason, CANVAS_W/2, CANVAS_H/2 - 48);

    ctx.fillStyle = C.ACCENT;
    ctx.font = '9px "Press Start 2P",monospace';
    ctx.fillText('FINAL SCORE', CANVAS_W/2, CANVAS_H/2);
    ctx.fillStyle = C.TEXT;
    ctx.font = '22px "Press Start 2P",monospace';
    ctx.fillText(String(this.score), CANVAS_W/2, CANVAS_H/2 + 36);

    if (this.score >= this.highScore && this.highScore > 0) {
      ctx.fillStyle = '#f0a000';
      ctx.font = '9px "Press Start 2P",monospace';
      ctx.fillText('NEW HIGH SCORE!', CANVAS_W/2, CANVAS_H/2 + 70);
    }

    const blink = Math.sin(this.animT / 400) > 0;
    if (blink) {
      ctx.fillStyle = C.TEXT;
      ctx.font = '10px "Press Start 2P",monospace';
      ctx.fillText('ENTER TO RETRY', CANVAS_W/2, CANVAS_H/2 + 110);
    }
    ctx.fillStyle = C.DIM;
    ctx.font = '9px "Press Start 2P",monospace';
    ctx.fillText('ESC FOR MENU', CANVAS_W/2, CANVAS_H/2 + 140);
    ctx.restore();
  }
}

// ===================== BOOT =====================
window.addEventListener('DOMContentLoaded', () => {
  const cvs = document.getElementById('gameCanvas');
  if (cvs) new Game(cvs).start();
});
})();
