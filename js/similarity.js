// View 3 (Q4): which investors hold similar portfolios and which are alone.
// Left: matrix of the overlap of every pair in the selected quarter, with the
// overlap to the closest other investor as a bar per row. Right: overlap of
// the selected investor with all others over the 30 quarters.

function createSimilarityView(data, state, actions) {
  const CELL = 7;
  const LABELS = 128;
  const TOP = 16;
  const NEAREST = 70;
  const NEIGHBOURS = 5;
  const MAX_SHADE = 30;  // overlap in % that gets the darkest colour
  const count = data.investors.length;
  const SIZE = CELL * count;
  const WIDTH = LABELS + SIZE + 12 + NEAREST + 24;
  const HEIGHT = TOP + SIZE + 4;
  const ordered = d3.sort(data.investors, investor => investor.order);
  const position = investor => investor.order * CELL;

  const color = d3.scaleSequential(d3.interpolateRgbBasis(COLORS.overlap)).domain([0, MAX_SHADE]).clamp(true);
  const nearestLength = d3.scaleLinear([0, 50], [0, NEAREST]).clamp(true);

  const svg = createSvg("#matrix", WIDTH, HEIGHT);
  svg.append("text").attr("class", "faint").attr("x", LABELS).attr("y", 10).text("Overlap with each other investor");
  svg.append("text").attr("class", "faint").attr("x", LABELS + SIZE + 12).attr("y", 10).text("Closest other");
  const grid = svg.append("g").attr("transform", `translate(${LABELS},${TOP})`);
  grid.append("rect").attr("width", SIZE).attr("height", SIZE).attr("fill", "#f4f4f2");
  const cells = grid.append("g");
  const rowFrame = grid.append("rect").attr("class", "selection-frame").attr("width", SIZE).attr("height", CELL);
  const columnFrame = grid.append("rect").attr("class", "selection-frame").attr("width", CELL).attr("height", SIZE);
  const names = svg.append("g").attr("transform", `translate(${LABELS - 4},${TOP})`);
  const nearest = svg.append("g").attr("transform", `translate(${LABELS + SIZE + 12},${TOP})`);

  // Colour legend
  const legend = svg.append("g").attr("transform", `translate(${LABELS + SIZE - 150},3)`);
  legend.append("text").attr("class", "faint").attr("x", -4).attr("y", 7).attr("text-anchor", "end").text("0");
  legend.selectAll("rect").data(d3.range(0, MAX_SHADE + 1, 5))
    .join("rect").attr("x", (value, i) => i * 12).attr("width", 12).attr("height", 8).attr("fill", color);
  legend.append("text").attr("class", "faint").attr("x", 88).attr("y", 7).text(`${MAX_SHADE}+ %`);

  function closestOther(investor, quarter) {
    const others = data.investors.filter(other => other !== investor);
    const best = d3.greatest(others, other => data.overlap(quarter, investor, other));
    return { other: best, overlap: data.overlap(quarter, investor, best) };
  }

  function renderMatrix() {
    const quarter = state.quarter;
    const filled = [];
    for (const row of ordered) {
      for (const column of ordered) {
        const overlap = row === column ? null : data.overlap(quarter, row, column);
        if (overlap) filled.push({ row, column, overlap });
      }
    }
    cells.selectAll("rect").data(filled, d => `${d.row.id}-${d.column.id}`)
      .join("rect").attr("width", CELL).attr("height", CELL).style("cursor", "pointer")
      .attr("x", d => position(d.column)).attr("y", d => position(d.row))
      .attr("fill", d => color(d.overlap))
      .on("mousemove", (event, d) => showTooltip(event,
        `<b>${d.row.name}</b> and <b>${d.column.name}</b><br>` +
        `${d.overlap} % of both portfolios in the same stocks`))
      .on("mouseleave", hideTooltip)
      .on("click", (event, d) => actions.setInvestor(d.row, d.column));

    names.selectAll("text").data(ordered, investor => investor.id)
      .join("text").attr("text-anchor", "end").style("font-size", "6.5px").style("cursor", "pointer")
      .attr("y", investor => position(investor) + CELL - 1.5)
      .attr("class", investor => {
        if (investor === state.investor) return "strong";
        return investor.filed[quarter] ? null : "faint";
      })
      .text(investor => shorten(investor.name, 30) + (investor.filed[quarter] ? "" : " (no filing)"))
      .on("click", (event, investor) => actions.setInvestor(investor, null));

    const closest = ordered.filter(investor => investor.filed[quarter])
      .map(investor => ({ investor, ...closestOther(investor, quarter) }));
    nearest.selectAll("rect").data(closest, d => d.investor.id)
      .join("rect").attr("height", CELL - 2).attr("rx", 1)
      .attr("y", d => position(d.investor) + 1)
      .attr("width", d => Math.max(1, nearestLength(d.overlap)))
      .attr("fill", d => d.investor === state.investor ? COLORS.ink : COLORS.overlap[3])
      .on("mousemove", (event, d) => showTooltip(event,
        `<b>${d.investor.name}</b><br>Closest: ${d.other.name}, ${d.overlap} % overlap`))
      .on("mouseleave", hideTooltip);

    rowFrame.attr("y", position(state.investor));
    columnFrame.attr("x", position(state.partner || state.investor))
      .style("opacity", state.partner ? 1 : 0);
  }

  const chart = createTimeChart("#neighbours", data.quarters, {
    width: 430,
    height: HEIGHT * 0.72,
    onPick: actions.setQuarter,
    onHover(event, quarter) {
      const lines = highlighted().map(({ other, colour }) =>
        `<i style="background:${colour}"></i>${other.name}: ${data.overlap(quarter, state.investor, other) ?? "–"} %`);
      showTooltip(event, `<b>${quarterLabel(data.quarters[quarter])}</b><br>${lines.join("<br>")}`);
    },
  });
  const line = d3.line().defined(d => d !== null).x((d, i) => chart.x(i)).y(d => chart.y(d));

  function overlapSeries(other) {
    return data.quarters.map((date, quarter) => data.overlap(quarter, state.investor, other));
  }

  // The most similar investors over all quarters, plus the clicked partner.
  function highlighted() {
    const others = data.investors.filter(other => other !== state.investor);
    const top = d3.sort(others, other => -(d3.mean(overlapSeries(other)) || 0)).slice(0, NEIGHBOURS);
    const result = top.map((other, i) => ({ other, colour: COLORS.series[i] }));
    if (state.partner && !top.includes(state.partner)) result.push({ other: state.partner, colour: COLORS.ink });
    return result;
  }

  function renderNeighbours() {
    const investor = state.investor;
    const quarter = state.quarter;
    const filed = investor.filed[quarter];
    d3.select("#neighbours-caption").text(
      `${investor.name}: overlap with every other investor since 2019. Coloured: the ${NEIGHBOURS} most similar on average. ` +
      (filed ? `${quarterLabel(data.quarters[quarter])}: ${filed.positions} positions, ${Math.round(filed.top10)} % in the ten largest.`
        : `No filing in ${quarterLabel(data.quarters[quarter])}.`));

    const others = data.investors.filter(other => other !== investor).map(other => ({ other, series: overlapSeries(other) }));
    const focus = highlighted().map(d => ({ ...d, series: overlapSeries(d.other) }));
    chart.setDomain([0, Math.max(20, d3.max(others, d => d3.max(d.series)) || 0)]);
    chart.setQuarter(quarter);

    chart.marks.selectAll("path.context-line").data(others, d => d.other.id)
      .join("path").attr("class", "context-line").attr("d", d => line(d.series));
    chart.marks.selectAll("path.line").data(focus, d => d.other.id)
      .join("path").attr("class", "line").attr("stroke", d => d.colour).attr("d", d => line(d.series)).raise();

    const lastValue = series => series.findLast(value => value !== null) ?? 0;
    const labels = spreadLabels(focus.map(d => ({ ...d, y: chart.y(lastValue(d.series)) })), 11);
    chart.marks.selectAll("text.end").data(labels, d => d.other.id)
      .join("text").attr("class", "end").style("font-size", "9px")
      .attr("x", chart.labelX - 2).attr("y", d => d.y + 3)
      .text(d => shorten(d.other.name, 15));
    chart.marks.selectAll("circle.end").data(labels, d => d.other.id)
      .join("circle").attr("class", "end").attr("r", 3)
      .attr("cx", chart.x(data.quarters.length - 1)).attr("cy", d => chart.y(lastValue(d.series)))
      .attr("fill", d => d.colour);
  }

  return {
    render() {
      renderMatrix();
      renderNeighbours();
    },
  };
}
