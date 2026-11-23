// Loads the five CSV files and indexes them by quarter, so that the views
// never have to search through rows.

const pairKey = (a, b) => a < b ? a * 1000 + b : b * 1000 + a;

async function loadData() {
  const [stockRows, stockQuarterRows, investorRows, investorQuarterRows, overlapRows] = await Promise.all(
    ["stocks", "stock_quarter", "investors", "investor_quarter", "overlap"].map(name => d3.csv(`data/${name}.csv`)));

  const quarters = [...new Set(investorQuarterRows.map(row => row.period_end))].sort();
  const quarterIndex = new Map(quarters.map((quarter, i) => [quarter, i]));
  const optional = value => value === "" ? null : +value;

  // A stock that nobody holds or trades in a quarter has no row: fill with zeros.
  const stocks = stockRows.map(row => ({
    ...row,
    series: quarters.map(() => ({ n: 0, net: 0, z: null, usualMean: null, usualSd: null })),
  }));
  const stockByTicker = new Map(stocks.map(stock => [stock.ticker, stock]));
  for (const row of stockQuarterRows) {
    stockByTicker.get(row.ticker).series[quarterIndex.get(row.period_end)] = {
      n: +row.n_investors,
      net: +row.net_buying,
      z: optional(row.net_buying_z),
      usualMean: optional(row.usual_mean),
      usualSd: optional(row.usual_sd),
    };
  }

  // filed[quarter] is null when the investor did not file that quarter.
  const investors = investorRows.map((row, id) => ({
    id,
    name: row.investor_name,
    order: +row.matrix_order,
    mapX: +row.map_x,
    mapY: +row.map_y,
    filed: quarters.map(() => null),
  }));
  const investorByName = new Map(investors.map(investor => [investor.name, investor]));
  for (const row of investorQuarterRows) {
    investorByName.get(row.investor_name).filed[quarterIndex.get(row.period_end)] = {
      positions: +row.n_positions,
      top10: +row.top10_weight_pct,
    };
  }

  const overlapByQuarter = quarters.map(() => new Map());
  for (const row of overlapRows) {
    overlapByQuarter[quarterIndex.get(row.period_end)].set(pairKey(+row.a, +row.b), +row.overlap);
  }

  return {
    quarters, stocks, stockByTicker, investors,
    // Overlap of two investors in a quarter; null if one of them did not file.
    overlap(quarter, a, b) {
      if (!a.filed[quarter] || !b.filed[quarter]) return null;
      return overlapByQuarter[quarter].get(pairKey(a.id, b.id)) || 0;
    },
  };
}
