/* =========================================================
   chart-render.js
   作業曲線（折れ線グラフ）の描画（Chart.js使用）
========================================================= */

const KraepelinChart = (() => {

  let chartInstance = null;

  /**
   * summary: KraepelinEngine.summarize() の戻り値
   */
  function render(summary) {
    const canvas = document.getElementById("result-chart");
    if (!canvas) return;

    const results = summary.results;
    const labels = results.map((r, i) => `${i + 1}行目`);
    const dataCounts = results.map(r => r.answered);

    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    let datasets;

    if (summary.mode === "renshu") {
      datasets = [
        {
          label: "処理数（練習モード）",
          data: dataCounts,
          borderColor: "#2f5d8a",
          backgroundColor: "rgba(47,93,138,0.15)",
          tension: 0.15,
          pointRadius: 4,
          fill: true,
        },
      ];
    } else {
      const half = KraepelinEngine.ROWS_PER_HALF;

      const firstData = dataCounts.map((v, i) => (i < half ? v : null));
      const secondData = dataCounts.map((v, i) => (i >= half ? v : null));

      datasets = [
        {
          label: "前半",
          data: firstData,
          borderColor: "#2f5d8a",
          backgroundColor: "rgba(47,93,138,0.15)",
          tension: 0.15,
          pointRadius: 4,
          spanGaps: false,
        },
        {
          label: "後半",
          data: secondData,
          borderColor: "#b5651d",
          backgroundColor: "rgba(181,101,29,0.15)",
          tension: 0.15,
          pointRadius: 4,
          spanGaps: false,
        },
      ];
    }

    const ctx = canvas.getContext("2d");
    chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "top",
          },
          title: {
            display: true,
            text: "作業曲線",
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "解いた問題数",
            },
          },
          x: {
            title: {
              display: true,
              text: "行",
            },
          },
        },
      },
    });
  }

  return { render };
})();
