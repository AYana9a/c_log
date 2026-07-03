// 外部ライブラリなしで動くシンプルなSVGレーダーチャート描画

/**
 * @param {SVGSVGElement} svg 描画対象のSVG要素
 * @param {string[]} labels 各軸のラベル(表示順)
 * @param {number[]} values 各軸の値 (0-100)
 */
export function drawRadar(svg, labels, values) {
  const size = 320;
  const center = size / 2;
  const radius = size * 0.36;
  const n = labels.length;
  const maxValue = 100;

  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.innerHTML = "";

  const angleFor = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pointFor = (i, value) => {
    const r = (value / maxValue) * radius;
    const angle = angleFor(i);
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  };

  const ns = "http://www.w3.org/2000/svg";
  const makeEl = (tag, attrs) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  // グリッド(同心多角形)
  const gridLevels = 4;
  for (let level = 1; level <= gridLevels; level++) {
    const r = (radius * level) / gridLevels;
    const pts = labels
      .map((_, i) => {
        const angle = angleFor(i);
        return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
      })
      .join(" ");
    svg.appendChild(
      makeEl("polygon", {
        points: pts,
        fill: "none",
        stroke: "var(--radar-grid)",
        "stroke-width": "1",
      })
    );
  }

  // 軸線とラベル
  labels.forEach((label, i) => {
    const [x, y] = pointFor(i, maxValue);
    svg.appendChild(
      makeEl("line", {
        x1: center,
        y1: center,
        x2: x,
        y2: y,
        stroke: "var(--radar-grid)",
        "stroke-width": "1",
      })
    );
    const lx = center + (radius + 26) * Math.cos(angleFor(i));
    const ly = center + (radius + 26) * Math.sin(angleFor(i));
    const text = makeEl("text", {
      x: lx,
      y: ly,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      class: "radar-label",
    });
    text.textContent = label;
    svg.appendChild(text);
  });

  // データ多角形
  const dataPts = values.map((v, i) => pointFor(i, v).join(",")).join(" ");
  svg.appendChild(
    makeEl("polygon", {
      points: dataPts,
      fill: "var(--radar-fill)",
      stroke: "var(--radar-stroke)",
      "stroke-width": "2",
    })
  );

  values.forEach((v, i) => {
    const [x, y] = pointFor(i, v);
    svg.appendChild(
      makeEl("circle", { cx: x, cy: y, r: 3, fill: "var(--radar-stroke)" })
    );
  });
}
