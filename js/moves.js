// View 2 (Q2): which stocks are bought or sold together this quarter, and is
// that unusual for the stock. Left: one point per stock, net_buying_z against
// the number of holders. Right: the net buying history of the focused stock.

function createMovesView(data, state, actions) {
  const WIDTH = 560;
  const HEIGHT = 466;
  const margin = { top: 24, right: 24, bottom: 40, left: 44 };
  const USUAL = 2;  // |z| up to this value counts as the usual range
  const maxHolders = d3.max(data.stocks, stock => d3.max(stock.series, d => d.n));

  const svg = createSvg("#outliers", WIDTH, HEIGHT);
  const x = d3.scaleLinear().range([margin.left, WIDTH - margin.right]);
  const y = d3.scaleLinear().range([HEIGHT - margin.bottom, margin.top]);
  const band = svg.append("rect").attr("class", "band")
    .attr("x", margin.left).attr("width", WIDTH - margin.left - margin.right);
  const bandLabel = svg.append("text").attr("class", "faint").attr("x", WIDTH - margin.right - 4)
    .attr("text-anchor", "end").text("usual range for the stock (±2 sd)");
  const xAxis = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${HEIGHT - margin.bottom})`);
  const yAxis = svg.append("g").attr("class", "axis grid").attr("transform", `translate(${margin.left},0)`);
  svg.append("text").attr("x", WIDTH - margin.right).attr("y", HEIGHT - 6).attr("text-anchor", "end")
    .text("Investors holding the stock →");
  svg.append("text").attr("x", 4).attr("y", 12).text("↑ more buying than usual (z-score)");
  const message = svg.append("text").attr("class", "faint").attr("x", WIDTH / 2).attr("y", HEIGHT / 2)
    .attr("text-anchor", "middle");
  const points = svg.append("g");
  const labels = svg.append("g");

  const legend = svg.append("g").attr("transform", `translate(${margin.left + 220},8)`);
  [["net bought", COLORS.bought], ["net sold", COLORS.sold], ["no net change", COLORS.unchanged]].forEach(([text, color], i) => {
    legend.append("circle").attr("cx", i * 92).attr("r", 4).attr("fill", color);
    legend.append("text").attr("x", i * 92 + 8).attr("y", 4).text(text);
  });

  function renderScatter() {
    const quarter = state.quarter;
    const shown = data.stocks
      .map(stock => ({ stock, ...stock.series[quarter] }))
      .filter(d => d.z !== null && d.n >= state.minHolders);
    message.text(shown.length ? "" : "Needs 8 earlier quarters: available from Q1 2021.");

    const limit = Math.max(4, d3.max(shown, d => Math.abs(d.z)) || 0);
    x.domain([state.minHolders - 1, maxHolders + 1]);
    y.domain([-limit, limit]).nice();
    xAxis.call(d3.axisBottom(x).ticks(8).tickSizeOuter(0));
    yAxis.call(d3.axisLeft(y).ticks(8).tickSize(-(WIDTH - margin.left - margin.right)));
    yAxis.select(".domain").remove();
    band.attr("y", y(USUAL)).attr("height", y(-USUAL) - y(USUAL));
    bandLabel.attr("y", y(-USUAL) - 5);

    const isOutlier = d => Math.abs(d.z) >= USUAL;
    const isSelected = d => state.colorOf(d.stock.ticker) !== null;
    points.selectAll("circle").data(shown, d => d.stock.ticker)
      .join("circle").attr("r", 5.5).style("cursor", "pointer")
      .attr("cx", d => x(d.n)).attr("cy", d => y(d.z))
      .attr("fill", d => netColor(d.net))
      .attr("fill-opacity", d => isOutlier(d) || isSelected(d) ? 1 : 0.4)
      .attr("stroke", d => isSelected(d) ? COLORS.ink : COLORS.surface)
      .attr("stroke-width", d => isSelected(d) ? 2 : 1.5)
      .on("mousemove", (event, d) => showTooltip(event,
        `<b>${d.stock.ticker}</b> ${d.stock.company}<br>` +
        `This quarter: ${signed(d.net)} investors net<br>` +
        `Last 8 quarters: ${signed(d.usualMean)} ± ${d.usualSd}<br>` +
        `z-score ${signed(d.z)} · ${d.n} holders`))
      .on("mouseleave", hideTooltip)
      .on("click", (event, d) => actions.toggleStock(d.stock.ticker));

    const labelled = d3.sort(shown.filter(d => isOutlier(d) || isSelected(d)), d => -Math.abs(d.z))
      .map(d => ({ ...d, text: d.stock.ticker, px: x(d.n), py: y(d.z) }));
    labels.selectAll("text").data(placeLabels(labelled), d => d.stock.ticker)
      .join("text").attr("class", "strong").style("pointer-events", "none")
      .attr("x", d => d.x).attr("y", d => d.y).attr("text-anchor", d => d.anchor)
      .text(d => d.text);
  }

  const history = createTimeChart("#history", data.quarters, {
    width: 520,
    height: HEIGHT,
    onPick: actions.setQuarter,
    onHover(event, quarter) {
      if (!state.focus) return;
      const d = data.stockByTicker.get(state.focus).series[quarter];
      const usual = d.usualMean === null ? "" : `<br>Usual: ${signed(d.usualMean)} ± ${d.usualSd}`;
      showTooltip(event,
        `<b>${state.focus}, ${quarterLabel(data.quarters[quarter])}</b><br>` +
        `${signed(d.net)} investors net · ${d.n} holders${usual}`);
    },
  });
  const barWidth = (history.x(1) - history.x(0)) * 0.7;

  function renderHistory() {
    const stock = data.stockByTicker.get(state.focus);
    d3.select("#history-caption").text(stock
      ? `${stock.ticker} (${stock.company}): investors who bought or added minus investors who reduced or sold, per quarter. ` +
        "Grey: the usual range from the 8 quarters before."
      : "Click a point to see the net buying history of the stock.");
    const series = stock ? stock.series.map((d, quarter) => ({ ...d, quarter })) : [];
    const usual = series.filter(d => d.usualMean !== null);
    const low = d => d.usualMean - USUAL * d.usualSd;
    const high = d => d.usualMean + USUAL * d.usualSd;
    const extent = d3.extent([
      ...series.map(d => d.net),
      ...usual.flatMap(d => [low(d), high(d)]),
      -5, 5,
    ]);
    history.setDomain(extent);
    history.setQuarter(state.quarter);

    history.marks.selectAll("rect.band").data(usual, d => d.quarter)
      .join("rect").attr("class", "band")
      .attr("x", d => history.x(d.quarter) - barWidth / 2 - 2).attr("width", barWidth + 4)
      .attr("y", d => history.y(high(d)))
      .attr("height", d => history.y(low(d)) - history.y(high(d)))
      .lower();  // a band added later must stay behind the bars
    history.marks.selectAll("rect.bar").data(series, d => d.quarter)
      .join("rect").attr("class", "bar")
      .attr("x", d => history.x(d.quarter) - barWidth / 2).attr("width", barWidth)
      .attr("y", d => history.y(Math.max(0, d.net)))
      .attr("height", d => Math.abs(history.y(d.net) - history.y(0)))
      .attr("fill", d => netColor(d.net))
      .attr("fill-opacity", d => d.quarter === state.quarter ? 1 : 0.55);
    history.marks.selectAll("line.zero").data(stock ? [0] : [])
      .join("line").attr("class", "zero").attr("stroke", COLORS.unchanged)
      .attr("x1", history.x(0) - barWidth).attr("x2", history.x(data.quarters.length - 1) + barWidth)
      .attr("y1", history.y(0)).attr("y2", history.y(0));
  }

  return {
    render() {
      renderScatter();
      renderHistory();
    },
  };
}
