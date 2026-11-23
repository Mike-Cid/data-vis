// Shared state of the three views and the controls in the top bar.

const DEFAULT_STOCKS = 5;
const DEFAULT_INVESTOR = "Warren Buffett";

loadData().then(data => {
  const lastQuarter = data.quarters.length - 1;

  const state = {
    quarter: lastQuarter,
    minHolders: 10,
    // A selected stock keeps its slot, and so its colour, until it is removed.
    slots: new Array(COLORS.series.length).fill(null),
    focus: null,     // stock shown in the net buying history
    investor: data.investors.find(investor => investor.name === DEFAULT_INVESTOR) || data.investors[0],
    partner: null,   // second investor of a clicked matrix cell
    selected() {
      return this.slots.filter(Boolean);
    },
    colorOf(ticker) {
      const slot = this.slots.indexOf(ticker);
      return slot < 0 ? null : COLORS.series[slot];
    },
  };

  const actions = {
    setQuarter(quarter) {
      state.quarter = quarter;
      render();
    },
    toggleStock(ticker) {
      const slot = state.slots.indexOf(ticker);
      if (slot >= 0) {
        state.slots[slot] = null;
        if (state.focus === ticker) state.focus = state.selected().at(-1) || null;
      } else {
        const free = state.slots.indexOf(null);
        if (free < 0) return;  // all colours in use: remove a stock first
        state.slots[free] = ticker;
        state.focus = ticker;
      }
      render();
    },
    setInvestor(investor, partner) {
      state.investor = investor;
      state.partner = partner;
      render();
    },
  };

  const views = [
    createConsensusView(data, state, actions),
    createMovesView(data, state, actions),
    createSimilarityView(data, state, actions),
  ];

  const quarterInput = d3.select("#quarter").attr("max", lastQuarter)
    .on("input", event => actions.setQuarter(+event.target.value));
  const holdersInput = d3.select("#min-holders")
    .on("input", event => { state.minHolders = +event.target.value; render(); });

  function renderControls() {
    quarterInput.property("value", state.quarter);
    d3.select("#quarter-label").text(quarterLabel(data.quarters[state.quarter]));
    holdersInput.property("value", state.minHolders);
    d3.select("#min-holders-label").text(state.minHolders);

    d3.select("#chips").selectAll("button").data(state.selected(), ticker => ticker)
      .join("button").attr("class", "chip").attr("title", "Remove from the selection")
      .html(ticker => `<i style="background:${state.colorOf(ticker)}"></i>${ticker} ×`)
      .on("click", (event, ticker) => actions.toggleStock(ticker));
  }

  function render() {
    renderControls();
    views.forEach(view => view.render());
  }

  // Start with the most held stocks of the latest quarter.
  d3.sort(data.stocks, stock => -stock.series[lastQuarter].n).slice(0, DEFAULT_STOCKS)
    .forEach((stock, slot) => { state.slots[slot] = stock.ticker; });
  state.focus = state.slots[0];
  render();
});
