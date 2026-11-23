// View 1 (Q1): which stocks do the most investors hold, and how did that
// number develop. Left: ranking of the selected quarter with a small line per
// stock. Right: the selected stocks on one common scale.

function createConsensusView(data, state, actions) {
  const ROWS = 20;
  const ROW_HEIGHT = 22;
  const HEADER = 26;
  const WIDTH = 560;
  const HEIGHT = HEADER + ROWS * ROW_HEIGHT;
  const COLUMN = { rank: 14, swatch: 26, ticker: 38, company: 92, bar: 262, spark: 430 };
  const lastQuarter = data.quarters.length - 1;
  const maxHolders = d3.max(data.stocks, stock => d3.max(stock.series, d => d.n));

  const barLength = d3.scaleLinear([0, maxHolders], [0, 120]);
  const sparkX = d3.scaleLinear([0, lastQuarter], [0, 120]);
  const sparkY = d3.scaleLinear([0, maxHolders], [ROW_HEIGHT - 4, 3]);
  const sparkLine = d3.line().x((d, i) => sparkX(i)).y(d => sparkY(d.n));

  const ranking = createSvg("#ranking", WIDTH, HEIGHT);
  ranking.append("text").attr("class", "faint").attr("x", COLUMN.bar).attr("y", 12).text("Holders this quarter");
  ranking.append("text").attr("class", "faint").attr("x", COLUMN.spark).attr("y", 12).text("Holders 2019 to 2026");

  function renderRanking() {
    const quarter = state.quarter;
    const top = d3.sort(data.stocks, stock => -stock.series[quarter].n, stock => stock.ticker).slice(0, ROWS);

    const rows = ranking.selectAll("g.row").data(top, stock => stock.ticker)
      .join(enter => {
        const row = enter.append("g").attr("class", "row");
        row.append("rect").attr("class", "hit").attr("width", WIDTH).attr("height", ROW_HEIGHT);
        row.append("text").attr("class", "rank faint").attr("x", COLUMN.rank).attr("y", 15).attr("text-anchor", "end");
        row.append("circle").attr("class", "swatch").attr("cx", COLUMN.swatch).attr("cy", 11).attr("r", 4);
        row.append("text").attr("class", "strong").attr("x", COLUMN.ticker).attr("y", 15).text(stock => stock.ticker);
        row.append("text").attr("x", COLUMN.company).attr("y", 15).text(stock => shorten(stock.company, 28));
        row.append("rect").attr("class", "bar").attr("x", COLUMN.bar).attr("y", 5).attr("height", 12).attr("rx", 2);
        row.append("text").attr("class", "value").attr("y", 15);
        const spark = row.append("g").attr("transform", `translate(${COLUMN.spark},0)`);
        spark.append("path").attr("class", "line").attr("stroke-width", 1.5).attr("d", stock => sparkLine(stock.series));
        spark.append("circle").attr("class", "now").attr("r", 2.5);
        return row;
      })
      .attr("transform", (stock, i) => `translate(0,${HEADER + i * ROW_HEIGHT})`)
      .on("click", (event, stock) => actions.toggleStock(stock.ticker));

    const color = stock => state.colorOf(stock.ticker) || COLORS.unchanged;
    rows.select(".rank").text((stock, i) => i + 1);
    rows.select(".swatch").attr("fill", color).style("opacity", stock => state.colorOf(stock.ticker) ? 1 : 0);
    rows.select(".bar").attr("fill", color).attr("width", stock => barLength(stock.series[quarter].n));
    rows.select(".value").attr("x", stock => COLUMN.bar + barLength(stock.series[quarter].n) + 5)
      .text(stock => stock.series[quarter].n);
    rows.select(".line").attr("stroke", color);
    rows.select(".now").attr("fill", color)
      .attr("cx", sparkX(quarter)).attr("cy", stock => sparkY(stock.series[quarter].n));
  }

  const trend = createTimeChart("#trend", data.quarters, {
    width: 520,
    height: HEIGHT,
    onPick: actions.setQuarter,
    onHover(event, quarter) {
      const lines = d3.sort(selectedStocks(), stock => -stock.series[quarter].n).map(stock =>
        `<i style="background:${state.colorOf(stock.ticker)}"></i>${stock.ticker}: ${stock.series[quarter].n}`);
      showTooltip(event, `<b>${quarterLabel(data.quarters[quarter])}</b><br>${lines.join("<br>")}`);
    },
  });
  const trendLine = d3.line().x((d, i) => trend.x(i)).y(d => trend.y(d.n));

  function selectedStocks() {
    return state.selected().map(ticker => data.stockByTicker.get(ticker));
  }

  function renderTrend() {
    const stocks = selectedStocks();
    trend.setDomain([0, Math.max(10, d3.max(stocks, stock => d3.max(stock.series, d => d.n)) || 0)]);
    trend.setQuarter(state.quarter);

    trend.marks.selectAll("path.line").data(stocks, stock => stock.ticker)
      .join("path").attr("class", "line")
      .attr("stroke", stock => state.colorOf(stock.ticker))
      .attr("d", stock => trendLine(stock.series));

    const labels = spreadLabels(
      stocks.map(stock => ({ stock, y: trend.y(stock.series[lastQuarter].n) })), 12);
    trend.marks.selectAll("text.end").data(labels, d => d.stock.ticker)
      .join("text").attr("class", "end strong")
      .attr("x", trend.labelX).attr("y", d => d.y + 4)
      .text(d => d.stock.ticker);
    trend.marks.selectAll("circle.end").data(labels, d => d.stock.ticker)
      .join("circle").attr("class", "end").attr("r", 3)
      .attr("cx", trend.x(lastQuarter)).attr("cy", d => trend.y(d.stock.series[lastQuarter].n))
      .attr("fill", d => state.colorOf(d.stock.ticker));
  }

  return {
    render() {
      renderRanking();
      renderTrend();
    },
  };
}
