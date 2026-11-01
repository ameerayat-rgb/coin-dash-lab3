/* global Phaser, COIN_DASH */
// Tiny Web Audio beeps so the game needs no audio files.
let audioCtx = null;
function beep(type, from, to, seconds, volume) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audioCtx = audioCtx || new Ctx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + seconds);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + seconds);
}
const playCoinSound = () => beep('square', 880, 1760, 0.12, 0.08);
const playHitSound = () => beep('sawtooth', 220, 55, 0.35, 0.15);

// High score persists in localStorage; storage can be unavailable (private mode, blocked), so fail quietly.
const BEST_KEY = 'coinDash.highScore';
function loadBest() {
  try { return Math.max(0, parseInt(localStorage.getItem(BEST_KEY), 10) || 0); } catch (e) { return 0; }
}
function saveBest(value) {
  try { localStorage.setItem(BEST_KEY, String(value)); } catch (e) { /* ignore */ }
}

class CoinDash extends Phaser.Scene {
  constructor() { super('CoinDash'); }

  create() {
    const c = COIN_DASH;
    this.score = 0;
    this.best = loadBest();
    this.finished = false;
    this.paused = false;
    this.deadline = this.time.now + c.roundSeconds * 1000;
    this.physics.world.setBounds(0, 44, c.width, c.height - 44);
    this.add.grid(c.width / 2, c.height / 2, c.width, c.height, 40, 40,
      c.colors.background, 1, 0x24334b, 0.45);
    this.hud = this.add.text(18, 12, '', { font: '18px monospace', color: '#ffffff' });
    this.player = this.add.rectangle(c.width / 2, c.height / 2, 24, 24, c.colors.player);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.coin = this.add.circle(100, 100, 9, c.colors.coin);
    this.physics.add.existing(this.coin);
    this.coin.body.setCircle(9);
    this.placeCoin();
    const level = c.difficulties[c.difficulty];
    const spacing = (c.width - 180) / Math.max(1, level.droneCount - 1);
    this.drones = this.physics.add.group();
    for (let i = 0; i < level.droneCount; i++) {
      const drone = this.add.rectangle(90 + i * spacing, 100, 26, 26, c.colors.drone);
      this.drones.add(drone);
      drone.body.setCollideWorldBounds(true).setBounce(1, 1);
      const angle = (35 + i * 105) * Math.PI / 180;
      drone.body.setVelocity(Math.cos(angle) * level.droneSpeed, Math.sin(angle) * level.droneSpeed);
    }
    this.physics.add.overlap(this.player, this.coin, () => {
      if (this.finished) return;
      this.score++;
      playCoinSound();
      if (this.score > this.best) {
        this.best = this.score;
        saveBest(this.best);
      }
      this.placeCoin();
    });
    this.physics.add.overlap(this.player, this.drones, () => {
      if (this.finished) return;
      playHitSound();
      this.finish('A drone caught you!');
    });
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,R');
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
    this.pauseLabel = this.add.text(c.width / 2, c.height / 2, 'Paused',
      { font: '32px monospace', color: '#ffffff', stroke: '#0a1120', strokeThickness: 6 })
      .setOrigin(0.5).setVisible(false);
    this.input.keyboard.on('keydown-P', () => this.togglePause());
    ['easy', 'normal', 'hard'].forEach((name, i) => {
      this.input.keyboard.on(`keydown-${['ONE', 'TWO', 'THREE'][i]}`, () => {
        c.difficulty = name;
        this.scene.restart();
      });
    });
  }

  togglePause() {
    if (this.finished) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.pausedAt = this.time.now;
      this.physics.pause();
    } else {
      // Push the deadline back so paused time does not count against the round.
      this.deadline += this.time.now - this.pausedAt;
      this.physics.resume();
    }
    this.pauseLabel.setVisible(this.paused);
  }

  placeCoin() {
    const c = COIN_DASH;
    // Avoid spawning the next coin directly underneath the player.
    let x, y;
    do {
      x = Phaser.Math.Between(25, c.width - 25);
      y = Phaser.Math.Between(70, c.height - 25);
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 60);
    this.coin.setPosition(x, y);
    this.coin.body.reset(x, y);
  }

  update() {
    if (this.finished || this.paused) return;
    const dx = Number(this.cursors.right.isDown || this.keys.D.isDown)
      - Number(this.cursors.left.isDown || this.keys.A.isDown);
    const dy = Number(this.cursors.down.isDown || this.keys.S.isDown)
      - Number(this.cursors.up.isDown || this.keys.W.isDown);
    const direction = new Phaser.Math.Vector2(dx, dy).normalize().scale(COIN_DASH.playerSpeed);
    this.player.body.setVelocity(direction.x, direction.y);
    const seconds = Math.max(0, Math.ceil((this.deadline - this.time.now) / 1000));
    this.hud.setText(`Coins: ${this.score}   Best: ${this.best}   Level: ${COIN_DASH.difficulty}   Time: ${seconds}s`);
    if (seconds === 0) this.finish('Time is up!');
  }

  finish(reason) {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    const c = COIN_DASH;
    this.add.rectangle(c.width / 2, c.height / 2, 460, 150, 0x0a1120, 0.95);
    this.add.text(c.width / 2, c.height / 2,
      `${reason}\n${this.score} coins collected\nPress R to try again`,
      { font: '24px monospace', color: '#ffffff', align: 'center', lineSpacing: 12 }
    ).setOrigin(0.5);
  }
}
window.coinDashGame = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: COIN_DASH.width,
  height: COIN_DASH.height,
  backgroundColor: COIN_DASH.colors.background,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
  scene: CoinDash
});
