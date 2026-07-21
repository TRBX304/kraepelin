/* =========================================================
   sound.js
   Web Audio API を使った簡易通知音（外部音声ファイル不要）
========================================================= */

const KraepelinSound = (() => {
  let audioCtx = null;
  let enabled = true;

  function getCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    return audioCtx;
  }

  function setEnabled(value) {
    enabled = !!value;
  }

  // 短い「ピッ」音を1回鳴らす
  function beep({ freq = 880, duration = 0.15, volume = 0.25, type = "sine" } = {}) {
    if (!enabled) return;
    try {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // AudioContextが使えない環境では無視
      console.warn("sound error", e);
    }
  }

  // 1分経過ごとの合図（ピピッ）
  function playMinuteSignal() {
    beep({ freq: 1000, duration: 0.12, volume: 0.28 });
    setTimeout(() => beep({ freq: 1000, duration: 0.12, volume: 0.28 }), 180);
  }

  // 検査開始の合図
  function playStartSignal() {
    beep({ freq: 660, duration: 0.2, volume: 0.3 });
  }

  // 検査終了の合図
  function playEndSignal() {
    beep({ freq: 500, duration: 0.25, volume: 0.3 });
    setTimeout(() => beep({ freq: 700, duration: 0.3, volume: 0.3 }), 250);
  }

  // 休憩終了の合図
  function playBreakEndSignal() {
    beep({ freq: 800, duration: 0.2, volume: 0.3 });
    setTimeout(() => beep({ freq: 800, duration: 0.2, volume: 0.3 }), 220);
    setTimeout(() => beep({ freq: 800, duration: 0.2, volume: 0.3 }), 440);
  }

  return {
    setEnabled,
    playMinuteSignal,
    playStartSignal,
    playEndSignal,
    playBreakEndSignal,
  };
})();
