// Three static candidate encodings for each primary task, drawn with real
// values of the latest quarter. No interaction on purpose: each image has to
// answer the task on its own.

const W = 380;
const H = 300;
const sequential = d3.interpolateRgbBasis(COLORS.overlap);

// Adds one captioned figure to a section and returns its empty svg.
function panel(section, title, marksAndChannels, weakness) {
  const figure = d3.select(section).append("figure");
  figure.append("figcaption").html(`<b>${title}</b><br>${marksAndChannels}<br><i>Shows badly: ${weakness}</i>`);
  return figure.append("svg").attr("viewBox", [0, 0, W, H]).attr("width", "100%");
}

function yearAxis(svg, x, quarters, y) {
  const firstQuarters = d3.range(quarters.length).filter(i => quarters[i].slice(5, 7) === "03" && i % 8 === 0);
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${y})`)
    .call(d3.axisBottom(x).tickValues(firstQuarters).tickFormat(i => quarters[i].slice(0, 4)).tickSizeOuter(0));
}

// ---------------------------------------------------------------- Q1

function drawConsensus(data, latest) {
  const top = d3.sort(data.stocks, stock => -stock.series[latest].n).slice(0, 12);
  const maxHolders = d3.max(top, stock => d3.max(stock.series, d => d.n));

  // A: superimposed lines
  {
    const svg = panel("#q1", "A · Line chart, lines superimposed",
      "Mark: one line per stock. Quarter on horizontal position, holders on vertical position (common scale), stock on hue (8 stocks).",
      "more than about 8 stocks; lines cross and hues run out.");
    const x = d3.scaleLinear([0, latest], [30, W - 50]);
    const y = d3.scaleLinear([0, maxHolders], [H - 24, 10]).nice();
    yearAxis(svg, x, data.quarters, H - 24);
    svg.append("g").attr("class", "axis grid").attr("transform", "translate(30,0)")
      .call(d3.axisLeft(y).ticks(5).tickSize(-(W - 80))).select(".domain").remove();
    const line = d3.line().x((d, i) => x(i)).y(d => y(d.n));
    const shown = top.slice(0, 8);
    svg.selectAll("path.line").data(shown).join("path").attr("class", "line")
      .attr("stroke", (stock, i) => COLORS.series[i]).attr("d", stock => line(stock.series));
    const labels = spreadLabels(shown.map((stock, i) => ({ stock, i, y: y(stock.series[latest].n) })), 11);
    svg.selectAll("text.end").data(labels).join("text").attr("class", "end strong")
      .attr("x", W - 46).attr("y", d => d.y + 4).text(d => d.stock.ticker);
  }

  // B: heatmap
  {
    const svg = panel("#q1", "B · Heatmap",
      "Mark: one area (cell) per stock and quarter. Quarter on horizontal position, stock on vertical position (ordered by holders now), holders on colour luminance.",
      "exact values and small changes; luminance is a weak magnitude channel.");
    const x = d3.scaleBand(d3.range(latest + 1), [50, W - 6]);
    const y = d3.scaleBand(top.map(stock => stock.ticker), [10, H - 24]).padding(0.08);
    const color = d3.scaleSequential(sequential).domain([0, maxHolders]);
    yearAxis(svg, d3.scaleLinear([0, latest], [50 + x.bandwidth() / 2, W - 6 - x.bandwidth() / 2]), data.quarters, H - 24);
    svg.selectAll("g.stock").data(top).join("g").attr("class", "stock")
      .attr("transform", stock => `translate(0,${y(stock.ticker)})`)
      .call(row => row.append("text").attr("class", "strong").attr("x", 44).attr("y", y.bandwidth() / 2 + 4)
        .attr("text-anchor", "end").text(stock => stock.ticker))
      .selectAll("rect").data(stock => stock.series).join("rect")
      .attr("x", (d, i) => x(i)).attr("width", x.bandwidth()).attr("height", y.bandwidth())
      .attr("fill", d => color(d.n));
  }

  // C: small multiples
  {
    const svg = panel("#q1", "C · Small multiples",
      "Mark: one line per stock, each in its own panel. Quarter and holders on position, all panels with the same scales; stock on spatial region.",
      "comparing two stocks in the same quarter; the eye has to jump between panels.");
    const columns = 4;
    const cell = { width: W / columns, height: (H - 6) / 3 };
    const x = d3.scaleLinear([0, latest], [8, cell.width - 12]);
    const y = d3.scaleLinear([0, maxHolders], [cell.height - 10, 22]);
    const area = d3.area().x((d, i) => x(i)).y0(y(0)).y1(d => y(d.n));
    const line = d3.line().x((d, i) => x(i)).y(d => y(d.n));
    const cells = svg.selectAll("g").data(top).join("g")
      .attr("transform", (stock, i) => `translate(${(i % columns) * cell.width},${Math.floor(i / columns) * cell.height})`);
    cells.append("path").attr("fill", COLORS.overlap[1]).attr("d", stock => area(stock.series));
    cells.append("path").attr("class", "line").attr("stroke", COLORS.bought).attr("stroke-width", 1.5).attr("d", stock => line(stock.series));
    cells.append("line").attr("stroke", "#c3c2b7").attr("x1", x(0)).attr("x2", x(latest)).attr("y1", y(0)).attr("y2", y(0));
    cells.append("text").attr("class", "strong").attr("x", 8).attr("y", 14).text(stock => stock.ticker);
    cells.append("text").attr("x", cell.width - 12).attr("y", 14).attr("text-anchor", "end").text(stock => stock.series[latest].n);
  }
}

// ---------------------------------------------------------------- Q2

function drawMoves(data, latest) {
  const all = data.stocks.map(stock => ({ stock, ...stock.series[latest] })).filter(d => d.z !== null && d.n >= 10);
  const sorted = d3.sort(all, d => -d.z);
  const extremes = [...sorted.slice(0, 8), ...sorted.slice(-8)];

  // A: scatterplot
  {
    const svg = panel("#q2", "A · Scatterplot",
      `Mark: one point per stock (${all.length} stocks). Holders on horizontal position, z-score on vertical position, direction of the raw net buying on hue. Grey band: usual range.`,
      "the raw number of buyers and sellers; a z-score needs an explanation.");
    const x = d3.scaleLinear(d3.extent(all, d => d.n), [34, W - 34]).nice();
    const y = d3.scaleLinear([-4, 4], [H - 26, 10]);
    svg.append("rect").attr("class", "band").attr("x", 34).attr("width", W - 68).attr("y", y(2)).attr("height", y(-2) - y(2));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - 26})`).call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));
    svg.append("g").attr("class", "axis grid").attr("transform", "translate(34,0)")
      .call(d3.axisLeft(y).ticks(8).tickSize(-(W - 68))).select(".domain").remove();
    svg.selectAll("circle").data(all).join("circle").attr("r", 4.5)
      .attr("cx", d => x(d.n)).attr("cy", d => y(d.z)).attr("fill", d => netColor(d.net))
      .attr("fill-opacity", d => Math.abs(d.z) >= 2 ? 1 : 0.4).attr("stroke", COLORS.surface);
    const labelled = sorted.filter(d => Math.abs(d.z) >= 2)
      .map(d => ({ ...d, text: d.stock.ticker, px: x(d.n), py: y(d.z) }));
    svg.selectAll("text.name").data(placeLabels(labelled, 7)).join("text").attr("class", "name strong")
      .attr("x", d => d.x).attr("y", d => d.y).attr("text-anchor", d => d.anchor).text(d => d.text);
  }

  const rows = d3.scaleBand(extremes.map(d => d.stock.ticker), [14, H - 24]).padding(0.25);

  // B: sorted diverging bars
  {
    const svg = panel("#q2", "B · Sorted diverging bars",
      "Mark: one line (bar) per stock, 8 highest and 8 lowest. z-score on length from a common zero, rank on vertical position, direction of the raw net buying on hue; holders as text.",
      "the context: a stock with 10 holders and one with 36 look the same, and the middle of the distribution is cut off.");
    const x = d3.scaleLinear([-4, 4], [70, W - 40]);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - 24})`).call(d3.axisBottom(x).ticks(8).tickSizeOuter(0));
    svg.append("text").attr("class", "faint").attr("x", W - 4).attr("y", 10).attr("text-anchor", "end").text("holders");
    const row = svg.selectAll("g.stock").data(extremes).join("g").attr("class", "stock")
      .attr("transform", d => `translate(0,${rows(d.stock.ticker)})`);
    row.append("rect").attr("x", d => x(Math.min(0, d.z))).attr("width", d => Math.abs(x(d.z) - x(0)))
      .attr("height", rows.bandwidth()).attr("rx", 2).attr("fill", d => netColor(d.net));
    row.append("text").attr("class", "strong").attr("x", 62).attr("y", rows.bandwidth() / 2 + 4).attr("text-anchor", "end").text(d => d.stock.ticker);
    row.append("text").attr("x", W - 4).attr("y", rows.bandwidth() / 2 + 4).attr("text-anchor", "end").text(d => d.n);
    svg.append("line").attr("stroke", COLORS.unchanged).attr("x1", x(0)).attr("x2", x(0)).attr("y1", 14).attr("y2", H - 24);
  }

  // C: point against the stock's own range
  {
    const svg = panel("#q2", "C · Point against its own range",
      "Marks: one line (range) and one point per stock. Usual net buying (mean ± 2 sd of the last 8 quarters) on horizontal position and length, this quarter's net buying as a point on the same scale, direction on hue.",
      "more than about 20 stocks, and the holders are not shown at all.");
    const low = d => d.usualMean - 2 * d.usualSd;
    const high = d => d.usualMean + 2 * d.usualSd;
    const x = d3.scaleLinear([d3.min(extremes, d => Math.min(low(d), d.net)), d3.max(extremes, d => Math.max(high(d), d.net))], [70, W - 12]).nice();
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - 24})`).call(d3.axisBottom(x).ticks(8).tickSizeOuter(0));
    svg.append("line").attr("stroke", COLORS.unchanged).attr("x1", x(0)).attr("x2", x(0)).attr("y1", 14).attr("y2", H - 24);
    const row = svg.selectAll("g.stock").data(extremes).join("g").attr("class", "stock")
      .attr("transform", d => `translate(0,${rows(d.stock.ticker) + rows.bandwidth() / 2})`);
    row.append("line").attr("stroke", "#c3c2b7").attr("stroke-width", 5).attr("stroke-linecap", "round")
      .attr("x1", d => x(low(d))).attr("x2", d => x(high(d)));
    row.append("circle").attr("r", 4.5).attr("cx", d => x(d.net)).attr("fill", d => netColor(d.net)).attr("stroke", COLORS.surface);
    row.append("text").attr("class", "strong").attr("x", 62).attr("y", 4).attr("text-anchor", "end").text(d => d.stock.ticker);
  }
}

// ---------------------------------------------------------------- Q4

function drawSimilarity(data, latest) {
  // Every fifth investor in matrix order: a small sample that keeps the groups.
  const sample = d3.sort(data.investors.filter(investor => investor.filed[latest]), investor => investor.order)
    .filter((investor, i) => i % 5 === 0);
  const pairs = d3.cross(sample, sample).filter(([a, b]) => a.id < b.id)
    .map(([source, target]) => ({ source, target, overlap: data.overlap(latest, source, target) }));
  const name = investor => shorten(investor.name, 16);

  // A: node-link diagram
  {
    const svg = panel("#q4", "A · Node-link diagram",
      "Marks: one point per investor, one line per pair with at least 10 % overlap. Overlap on line width; position comes from a force layout and has no meaning of its own.",
      "the overlap value (width is weak), and the picture changes with the threshold and with every quarter.");
    const nodes = sample.map(investor => ({ investor }));
    const nodeOf = new Map(nodes.map(node => [node.investor, node]));
    const links = pairs.filter(pair => pair.overlap >= 10)
      .map(pair => ({ source: nodeOf.get(pair.source), target: nodeOf.get(pair.target), overlap: pair.overlap }));
    d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).strength(link => link.overlap / 60))
      .force("charge", d3.forceManyBody().strength(-160))
      .force("x", d3.forceX(W / 2 - 20).strength(0.12))
      .force("y", d3.forceY(H / 2).strength(0.16))
      .force("box", () => nodes.forEach(node => {
        node.x = Math.max(40, Math.min(W - 40, node.x));
        node.y = Math.max(14, Math.min(H - 14, node.y));
      }))
      .stop().tick(300);
    svg.selectAll("line").data(links).join("line").attr("stroke", COLORS.overlap[3]).attr("stroke-opacity", 0.7)
      .attr("stroke-width", link => link.overlap / 6)
      .attr("x1", link => link.source.x).attr("y1", link => link.source.y)
      .attr("x2", link => link.target.x).attr("y2", link => link.target.y);
    svg.selectAll("circle").data(nodes).join("circle").attr("r", 4).attr("fill", COLORS.ink).attr("stroke", COLORS.surface)
      .attr("cx", node => node.x).attr("cy", node => node.y);
    svg.selectAll("text").data(nodes).join("text").style("font-size", "9px")
      .attr("x", node => node.x + 6).attr("y", node => node.y + 3).text(node => name(node.investor));
  }

  // B: adjacency matrix
  {
    const svg = panel("#q4", "B · Adjacency matrix",
      "Mark: one area (cell) per pair. The two investors on horizontal and vertical position, in the same clustered order; overlap on colour luminance.",
      "paths over several investors, and it needs space: 84 investors are 7,056 cells.");
    const names = sample.map(name);
    const band = d3.scaleBand(names, [96, W - 6]).padding(0.06);
    const offsetY = H - (W - 6 - 96) - 4;
    const color = d3.scaleSequential(sequential).domain([0, 40]).clamp(true);
    svg.append("rect").attr("x", 96).attr("y", offsetY).attr("width", W - 102).attr("height", W - 102).attr("fill", "#f4f4f2");
    svg.selectAll("rect.cell").data(pairs.flatMap(pair => [pair, { source: pair.target, target: pair.source, overlap: pair.overlap }]))
      .join("rect").attr("class", "cell").attr("width", band.bandwidth()).attr("height", band.bandwidth())
      .attr("x", pair => band(name(pair.target))).attr("y", pair => band(name(pair.source)) - 96 + offsetY)
      .attr("fill", pair => color(pair.overlap));
    svg.selectAll("text").data(sample).join("text").style("font-size", "9px").attr("text-anchor", "end")
      .attr("x", 92).attr("y", investor => band(name(investor)) - 96 + offsetY + band.bandwidth() / 2 + 3).text(name);
  }

  // C: similarity map
  {
    const svg = panel("#q4", "C · Similarity map",
      "Mark: one point per investor. Position from multidimensional scaling of the overlap, so that near means similar. No link marks.",
      "the overlap of a given pair; two dimensions distort the distances, and near does not always mean similar.");
    const x = d3.scaleLinear(d3.extent(sample, investor => investor.mapX), [30, W - 70]);
    const y = d3.scaleLinear(d3.extent(sample, investor => investor.mapY), [H - 16, 16]);
    svg.selectAll("circle").data(sample).join("circle").attr("r", 4.5).attr("fill", COLORS.bought).attr("stroke", COLORS.surface)
      .attr("cx", investor => x(investor.mapX)).attr("cy", investor => y(investor.mapY));
    const labelled = sample.map(investor => ({ text: name(investor), px: x(investor.mapX), py: y(investor.mapY) }));
    svg.selectAll("text").data(placeLabels(labelled, 7)).join("text").style("font-size", "9px")
      .attr("x", d => d.x).attr("y", d => d.y).attr("text-anchor", d => d.anchor).text(d => d.text);
  }
}

loadData().then(data => {
  const latest = data.quarters.length - 1;
  d3.select("#quarter-note").text(`Static candidate encodings, real values of ${quarterLabel(data.quarters[latest])}.`);
  drawConsensus(data, latest);
  drawMoves(data, latest);
  drawSimilarity(data, latest);
});
