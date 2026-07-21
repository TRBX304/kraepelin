/* =========================================================
   test-engine.js
   内田クレペリン検査ロジック：
   数字生成・行管理・タイマー・自動改行・採点処理
   （UI表示やDOM操作以外の「状態管理」を担当）
========================================================= */

const KraepelinEngine = (() => {

  const DIGITS_PER_ROW = 70;     // 1行あたりの数字数（目安70文字）
  const ROWS_PER_HALF = 15;      // 前半/後半の行数（本番モード用）
  const SEC_PER_ROW = 60;        // 1行=1分

  let state = null;

  function randDigit() {
    return Math.floor(Math.random() * 10);
  }

  function generateRow() {
    const row = [];
    for (let i = 0; i < DIGITS_PER_ROW; i++) {
      row.push(randDigit());
    }
    return row;
  }

  // 隣接する2数の和の一の位を正解として計算
  function computeAnswers(row) {
    const answers = [];
    for (let i = 0; i < row.length - 1; i++) {
      answers.push((row[i] + row[i + 1]) % 10);
    }
    return answers;
  }

  /**
   * mode: "honban" | "renshu"
   */
  function initTest(mode) {
    let totalRows;
    if (mode === "renshu") {
      totalRows = 5; // 練習モード：5分間＝5行、休憩なし
    } else {
      totalRows = ROWS_PER_HALF * 2; // 本番モード：前半15行＋後半15行
    }

    const rows = [];
    for (let i = 0; i < totalRows; i++) {
      const digits = generateRow();
      rows.push({
        digits,
        answers: computeAnswers(digits),
        userInputs: new Array(digits.length - 1).fill(null),
      });
    }

    state = {
      mode,
      rows,
      totalRows,
      currentRowIndex: 0,     // 通し番号（0始まり）
      currentCellIndex: 0,    // 現在の行内での入力位置
      phase: "first",         // "first" | "break" | "second" （renshuは常にfirst扱い）
      rowResults: [],         // 各行の解答数・正答数を記録（グラフ用）
      startedAt: null,
      finished: false,
    };

    return state;
  }

  function getState() {
    return state;
  }

  function getCurrentRow() {
    return state.rows[state.currentRowIndex];
  }

  function isHalfway() {
    // 本番モードにおいて、前半が終わるタイミングか
    // ※ この関数は moveToNextRow() 内で currentRowIndex をインクリメントする「前」に
    //    呼ばれるため、「15行目(index=14)を解き終えた瞬間」を判定するには
    //    ROWS_PER_HALF - 1 と比較する必要がある。
    if (state.mode !== "honban") return false;
    return state.currentRowIndex === ROWS_PER_HALF - 1;
  }

  // 現在の行がどちらのフェーズに属するか判定（結果グラフ色分け用）
  function getPhaseOfRow(rowIndex) {
    if (state.mode === "renshu") return "renshu";
    return rowIndex < ROWS_PER_HALF ? "first" : "second";
  }

  /**
   * 入力を受け付ける。数字1文字(0-9)を想定。
   * 戻り値: { correct: boolean, rowFinished: boolean }
   */
  function inputDigit(digitChar) {
    const row = getCurrentRow();
    if (!row) return null;

    const idx = state.currentCellIndex;
    if (idx >= row.answers.length) {
      return { correct: null, rowFinished: true, noSpace: true };
    }

    const digit = parseInt(digitChar, 10);
    row.userInputs[idx] = digit;
    const correct = digit === row.answers[idx];

    state.currentCellIndex++;

    const rowFinished = state.currentCellIndex >= row.answers.length;

    return { correct, rowFinished, cellIndex: idx };
  }

  // ひとつ前のマスに戻る（バックスペース相当）。入力値もクリア。
  function backspace() {
    const row = getCurrentRow();
    if (!row) return;

    if (state.currentCellIndex > 0) {
      state.currentCellIndex--;
      row.userInputs[state.currentCellIndex] = null;
    }
  }

  // 現在の行を集計してrowResultsに記録する
  function recordRowResult() {
    const row = getCurrentRow();
    let answered = 0;
    let correct = 0;

    for (let i = 0; i < row.answers.length; i++) {
      if (row.userInputs[i] !== null) {
        answered++;
        if (row.userInputs[i] === row.answers[i]) {
          correct++;
        }
      }
    }

    state.rowResults.push({
      rowIndex: state.currentRowIndex,
      phase: getPhaseOfRow(state.currentRowIndex),
      answered,
      correct,
    });
  }

  /**
   * 1分経過 or 手動で次の行へ強制移動。
   * 戻り値: { hasNextRow: boolean, isHalfwayBreak: boolean, testFinished: boolean }
   */
  function moveToNextRow() {
    recordRowResult();

    const wasHalfway = isHalfway();

    state.currentRowIndex++;
    state.currentCellIndex = 0;

    const testFinished = state.currentRowIndex >= state.totalRows;

    if (testFinished) {
      state.finished = true;
    }

    return {
      hasNextRow: !testFinished,
      isHalfwayBreak: wasHalfway && !testFinished,
      testFinished,
    };
  }

  function setPhase(phase) {
    state.phase = phase;
  }

  // 結果集計（グラフ・スタッツ用）
  function summarize() {
    const results = state.rowResults;

    const totalAnswered = results.reduce((s, r) => s + r.answered, 0);
    const totalCorrect = results.reduce((s, r) => s + r.correct, 0);
    const accuracy = totalAnswered > 0 ? (totalCorrect / totalAnswered) * 100 : 0;

    const perRowCounts = results.map(r => r.answered);
    const maxCount = perRowCounts.length ? Math.max(...perRowCounts) : 0;
    const minCount = perRowCounts.length ? Math.min(...perRowCounts) : 0;
    const avgCount = perRowCounts.length
      ? (perRowCounts.reduce((a, b) => a + b, 0) / perRowCounts.length)
      : 0;

    // 前半・後半平均（本番モードのみ意味を持つ）
    const firstResults = results.filter(r => r.phase === "first");
    const secondResults = results.filter(r => r.phase === "second");

    const avg = (arr) => arr.length
      ? arr.reduce((s, r) => s + r.answered, 0) / arr.length
      : 0;

    const firstAvg = avg(firstResults);
    const secondAvg = avg(secondResults);

    return {
      mode: state.mode,
      results,
      totalAnswered,
      totalCorrect,
      accuracy,
      avgCount,
      maxCount,
      minCount,
      firstAvg,
      secondAvg,
    };
  }

  return {
    SEC_PER_ROW,
    ROWS_PER_HALF,
    initTest,
    getState,
    getCurrentRow,
    isHalfway,
    getPhaseOfRow,
    inputDigit,
    backspace,
    moveToNextRow,
    setPhase,
    summarize,
  };
})();
