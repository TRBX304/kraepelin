/* =========================================================
   main.js
   画面制御・DOM操作・タイマー管理
   （test-engine.jsの状態を使ってUIを構築・更新する）
========================================================= */

(() => {

  // ---------- DOM取得 ----------
  const screens = {
    start: document.getElementById("screen-start"),
    test: document.getElementById("screen-test"),
    break: document.getElementById("screen-break"),
    result: document.getElementById("screen-result"),
  };

  const btnStart = document.getElementById("btn-start");
  const btnRetry = document.getElementById("btn-retry");
  const btnQuit = document.getElementById("btn-quit");
  const btnQuitBreak = document.getElementById("btn-quit-break");
  const soundToggle = document.getElementById("sound-toggle");
  const breakDurationSelect = document.getElementById("break-duration");
  const breakDurationRow = document.getElementById("break-duration-row");

  const phaseLabel = document.getElementById("phase-label");
  const rowLabel = document.getElementById("row-label");
  const timeRemainEl = document.getElementById("time-remain");
  const testArea = document.getElementById("test-area");
  const mobileKeypad = document.getElementById("mobile-keypad");

  const breakTimerEl = document.getElementById("break-timer");

  const statsGrid = document.getElementById("stats-grid");
  const feedbackBox = document.getElementById("feedback-box");

  // ---------- アプリ状態 ----------
  let selectedMode = "honban";
  let selectedBreakDuration = 300; // 秒。スタート画面で選択（デフォルト5分）

  // タイマーはDate.now()ベースの終了予定時刻を保持し、
  // setIntervalの間引き（バックグラウンドタブ等）によるドリフトを防ぐ。
  let rowTimerId = null;
  let rowEndAt = null; // 行タイマーの終了予定時刻(ms)

  let breakTimerId = null;
  let breakEndAt = null; // 休憩タイマーの終了予定時刻(ms)

  // ---------- 画面切り替え ----------
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  // ---------- スタート画面 ----------
  function updateBreakRowVisibility() {
    breakDurationRow.style.display = selectedMode === "honban" ? "flex" : "none";
  }

  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      selectedMode = e.target.value;
      updateBreakRowVisibility();
    });
  });

  breakDurationSelect.addEventListener("change", () => {
    selectedBreakDuration = parseInt(breakDurationSelect.value, 10);
  });

  updateBreakRowVisibility();

  soundToggle.addEventListener("change", () => {
    KraepelinSound.setEnabled(soundToggle.checked);
  });

  btnStart.addEventListener("click", () => {
    KraepelinSound.setEnabled(soundToggle.checked);
    startTest(selectedMode);
  });

  btnRetry.addEventListener("click", () => {
    showScreen("start");
  });

  function quitToStart() {
    const confirmed = window.confirm("検査を中断してホーム画面に戻りますか？\n（ここまでの結果は保存されません）");
    if (!confirmed) return;

    clearRowTimer();
    clearBreakTimer();
    showScreen("start");
  }

  btnQuit.addEventListener("click", quitToStart);
  btnQuitBreak.addEventListener("click", quitToStart);

  // ---------- 検査開始 ----------
  function startTest(mode) {
    KraepelinEngine.initTest(mode);
    KraepelinSound.playStartSignal();
    renderAllRows();
    updatePhaseAndRowLabel();
    startRowTimer();
    showScreen("test");
    focusCurrentCell();
  }

  // ---------- 行・マスの描画 ----------
  function renderAllRows() {
    const state = KraepelinEngine.getState();
    testArea.innerHTML = "";

    state.rows.forEach((row, rowIdx) => {
      const rowEl = document.createElement("div");
      rowEl.className = "krow";
      rowEl.dataset.rowIndex = rowIdx;

      const labelEl = document.createElement("span");
      labelEl.className = "krow-label";
      labelEl.textContent = `${rowIdx + 1}`;
      rowEl.appendChild(labelEl);

      row.digits.forEach((d, i) => {
        const numEl = document.createElement("span");
        numEl.className = "digit-num";
        numEl.textContent = d;
        rowEl.appendChild(numEl);

        // 最後の数字の後には入力マスは無い
        if (i < row.digits.length - 1) {
          const inputEl = document.createElement("input");
          inputEl.className = "digit-input";
          inputEl.type = "text";
          inputEl.inputMode = "numeric";
          inputEl.maxLength = 1;
          inputEl.readOnly = true; // キーボード直接入力は無効化し、共通ロジック経由にする
          inputEl.dataset.rowIndex = rowIdx;
          inputEl.dataset.cellIndex = i;
          rowEl.appendChild(inputEl);
        }
      });

      testArea.appendChild(rowEl);
    });

    updateRowHighlight();
  }

  function updateRowHighlight() {
    const state = KraepelinEngine.getState();
    const rowEls = testArea.querySelectorAll(".krow");

    rowEls.forEach((el, idx) => {
      el.classList.remove("row-current", "row-done");
      if (idx < state.currentRowIndex) {
        el.classList.add("row-done");
      } else if (idx === state.currentRowIndex) {
        el.classList.add("row-current");
      }
    });
  }

  function getCurrentCellEl() {
    const state = KraepelinEngine.getState();
    return testArea.querySelector(
      `.digit-input[data-row-index="${state.currentRowIndex}"][data-cell-index="${state.currentCellIndex}"]`
    );
  }

  function focusCurrentCell() {
    testArea.querySelectorAll(".digit-input.focused").forEach(el => el.classList.remove("focused"));
    const cell = getCurrentCellEl();
    if (cell) {
      cell.classList.add("focused");
      cell.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }

  function updatePhaseAndRowLabel() {
    const state = KraepelinEngine.getState();

    if (state.mode === "renshu") {
      phaseLabel.textContent = "練習モード";
    } else {
      phaseLabel.textContent = state.currentRowIndex < KraepelinEngine.ROWS_PER_HALF ? "前半" : "後半";
    }

    const rowNumInPhase = state.mode === "renshu"
      ? state.currentRowIndex + 1
      : (state.currentRowIndex < KraepelinEngine.ROWS_PER_HALF
          ? state.currentRowIndex + 1
          : state.currentRowIndex + 1 - KraepelinEngine.ROWS_PER_HALF);

    const totalInPhase = state.mode === "renshu"
      ? state.totalRows
      : KraepelinEngine.ROWS_PER_HALF;

    rowLabel.textContent = `行 ${rowNumInPhase} / ${totalInPhase}`;
  }

  // ---------- タイマー ----------
  // Date.now()ベースの「終了予定時刻」方式でドリフトを防ぐ。
  // setIntervalは表示更新のトリガーとしてのみ使用し、
  // 実際の残り秒数は毎回 (endAt - Date.now()) から計算する。
  function startRowTimer() {
    clearRowTimer();
    rowEndAt = Date.now() + KraepelinEngine.SEC_PER_ROW * 1000;
    updateTimeDisplay();

    rowTimerId = setInterval(() => {
      const remainMs = rowEndAt - Date.now();

      if (remainMs <= 0) {
        updateTimeDisplay(0);
        onRowTimeUp();
        return;
      }

      updateTimeDisplay(Math.ceil(remainMs / 1000));
    }, 250);
  }

  function clearRowTimer() {
    if (rowTimerId) {
      clearInterval(rowTimerId);
      rowTimerId = null;
    }
  }

  function updateTimeDisplay(secondsLeftOverride) {
    const secondsLeft = secondsLeftOverride !== undefined
      ? secondsLeftOverride
      : Math.max(0, Math.ceil((rowEndAt - Date.now()) / 1000));

    const m = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
    const s = (secondsLeft % 60).toString().padStart(2, "0");
    timeRemainEl.textContent = `${m}:${s}`;
  }

  function onRowTimeUp() {
    KraepelinSound.playMinuteSignal();
    advanceToNextRow();
  }

  function advanceToNextRow() {
    clearRowTimer();
    const result = KraepelinEngine.moveToNextRow();
    updateRowHighlight();

    if (result.testFinished) {
      KraepelinSound.playEndSignal();
      finishTest();
      return;
    }

    if (result.isHalfwayBreak) {
      startBreak();
      return;
    }

    updatePhaseAndRowLabel();
    focusCurrentCell();
    startRowTimer();
  }

  // ---------- 休憩 ----------
  function startBreak() {
    showScreen("break");
    breakEndAt = Date.now() + selectedBreakDuration * 1000;
    updateBreakDisplay();

    breakTimerId = setInterval(() => {
      const remainMs = breakEndAt - Date.now();

      if (remainMs <= 0) {
        updateBreakDisplay(0);
        clearBreakTimer();
        KraepelinSound.playBreakEndSignal();
        resumeAfterBreak();
        return;
      }

      updateBreakDisplay(Math.ceil(remainMs / 1000));
    }, 250);
  }

  function clearBreakTimer() {
    if (breakTimerId) {
      clearInterval(breakTimerId);
      breakTimerId = null;
    }
  }

  function updateBreakDisplay(secondsLeftOverride) {
    const secondsLeft = secondsLeftOverride !== undefined
      ? secondsLeftOverride
      : Math.max(0, Math.ceil((breakEndAt - Date.now()) / 1000));

    const m = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
    const s = (secondsLeft % 60).toString().padStart(2, "0");
    breakTimerEl.textContent = `${m}:${s}`;
  }

  function resumeAfterBreak() {
    showScreen("test");
    updatePhaseAndRowLabel();
    focusCurrentCell();
    startRowTimer();
  }

  // ---------- 入力処理 ----------
  function handleDigitInput(digitChar) {
    const state = KraepelinEngine.getState();
    if (!state || state.finished) return;

    const result = KraepelinEngine.inputDigit(digitChar);
    if (!result || result.noSpace) return;

    const cellEl = testArea.querySelector(
      `.digit-input[data-row-index="${state.currentRowIndex}"][data-cell-index="${result.cellIndex}"]`
    );
    if (cellEl) {
      cellEl.value = digitChar;
      cellEl.classList.remove("focused");
      cellEl.classList.add(result.correct ? "correct" : "wrong");
    }

    if (result.rowFinished) {
      // 行の最後まで入力し終えたら、すぐ次の行には行かず、
      // タイマーが1分に達するのを待つ（クレペリン検査の仕様に準拠）。
      // ただし、フォーカス表示だけ外しておく。
      testArea.querySelectorAll(".digit-input.focused").forEach(el => el.classList.remove("focused"));
    } else {
      focusCurrentCell();
    }
  }

  function handleBackspace() {
    const state = KraepelinEngine.getState();
    if (!state || state.finished) return;

    const prevIdx = state.currentCellIndex - 1;
    if (prevIdx < 0) return;

    const cellEl = testArea.querySelector(
      `.digit-input[data-row-index="${state.currentRowIndex}"][data-cell-index="${prevIdx}"]`
    );

    KraepelinEngine.backspace();

    if (cellEl) {
      cellEl.value = "";
      cellEl.classList.remove("correct", "wrong");
    }

    focusCurrentCell();
  }

  // PCキーボード入力
  document.addEventListener("keydown", (e) => {
    if (!screens.test.classList.contains("active")) return;

    if (e.key >= "0" && e.key <= "9") {
      handleDigitInput(e.key);
      e.preventDefault();
    } else if (e.key === "Backspace") {
      handleBackspace();
      e.preventDefault();
    }
  });

  // スマホ用テンキー
  mobileKeypad.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-key]");
    if (!btn) return;

    const key = btn.dataset.key;
    if (key === "back") {
      handleBackspace();
    } else {
      handleDigitInput(key);
    }
  });

  // ---------- 検査終了・結果表示 ----------
  function finishTest() {
    clearRowTimer();
    const summary = KraepelinEngine.summarize();

    renderStats(summary);
    renderFeedback(summary);
    KraepelinChart.render(summary);

    showScreen("result");
  }

  function renderStats(summary) {
    const boxes = [];

    boxes.push(makeStatBox(summary.avgCount.toFixed(1), "平均処理数（問/分）"));
    boxes.push(makeStatBox(summary.accuracy.toFixed(1) + "%", "正答率"));
    boxes.push(makeStatBox(summary.maxCount, "最高処理数"));
    boxes.push(makeStatBox(summary.minCount, "最低処理数"));
    boxes.push(makeStatBox(summary.totalAnswered, "総解答数"));
    boxes.push(makeStatBox(summary.totalCorrect, "総正答数"));

    statsGrid.innerHTML = "";
    boxes.forEach(b => statsGrid.appendChild(b));
  }

  function makeStatBox(value, label) {
    const box = document.createElement("div");
    box.className = "stat-box";
    box.innerHTML = `<span class="stat-value">${value}</span><span class="stat-label">${label}</span>`;
    return box;
  }

  function renderFeedback(summary) {
    const comments = [];

    // 正答率に基づくコメント
    if (summary.accuracy >= 97) {
      comments.push("正答率が非常に高く、正確に処理できています。");
    } else if (summary.accuracy >= 90) {
      comments.push("正答率は良好です。この調子を維持しましょう。");
    } else {
      comments.push("やや誤答が多いようです。スピードを少し落として、正確性を意識してみましょう。");
    }

    // 前半・後半の比較（本番モードのみ）
    if (summary.mode === "honban") {
      const diff = summary.secondAvg - summary.firstAvg;
      if (diff >= 1) {
        comments.push("後半の作業量が前半より向上しており、集中力の持続が見られます。素晴らしいです！");
      } else if (diff >= -1) {
        comments.push("前半・後半で作業量が安定しており、持久力のあるペース配分ができています。");
      } else {
        comments.push("後半にかけて作業量がやや落ちています。休憩の取り方やペース配分を見直してみましょう。");
      }
    } else {
      comments.push("練習モードの結果です。本番モード（30分）にもぜひ挑戦してみましょう。");
    }

    // 処理速度についてのコメント
    if (summary.avgCount >= 55) {
      comments.push("処理速度は全体的に速いペースです。");
    } else if (summary.avgCount >= 40) {
      comments.push("処理速度は平均的なペースです。");
    } else {
      comments.push("処理速度はやや控えめです。繰り返し練習することで徐々にスピードが上がっていきます。");
    }

    feedbackBox.innerHTML = `
      <h3>アドバイス</h3>
      <ul>
        ${comments.map(c => `<li>${c}</li>`).join("")}
      </ul>
    `;
  }

  // ---------- 初期表示 ----------
  showScreen("start");

})();
