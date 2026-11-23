// Colours, formatting and the small chart pieces that several views share.

const COLORS = {
  // identity of a selected stock or neighbour; assigned by slot, never by rank
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  bought: "#2a78d6",
  sold: "#e34948",
  unchanged: "#898781",
  ink: "#0b0b0b",
  surface: "#fcfcfb",
  // magnitude of portfolio overlap, light to dark
  overlap: ["#fcfcfb", "#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"],
};

const quarterLabel = date => `Q${Math.ceil(+date.slice(5, 7) / 3)} ${date.slice(0, 4)}`;
const signed = d3.format("+");
const shorten = (text, length) => text.length > length ? text.slice(0, length - 1) + "…" : text;

function netColor(net) {
  if (net > 0) return COLORS.bought;
  if (net < 0) return COLORS.sold;
  return COLORS.unchanged;
}

function createSvg(selector, width, height) {
  return d3.select(selector).append("svg").attr("viewBox", [0, 0, width, height]).attr("width", "100%");
}

const tooltip = d3.select("body").append("div").attr("class", "tooltip");

function showTooltip(event, html) {
  tooltip.html(html).style("opacity", 1)
    .style("left", `${event.pageX + 14}px`).style("top", `${event.pageY + 14}px`);
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

// Push labels apart vertically so that they do not overlap. Changes y in place.
function spreadLabels(labels, gap) {
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    labels[i].y = Math.max(labels[i].y, labels[i - 1].y + gap);
  }
  return labels;
}

// Put each label right of, left of, above or below its point (px, py), at the
// first of these spots that does not cover an earlier label. Labels come in
// order of importance. Sets x, y and anchor on every label.
function placeLabels(labels, offset = 8) {
  const HEIGHT = 11;
  const placed = [];
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  for (const label of labels) {
    const width = label.text.length * 7;
    const boxOf = spot => {
      const left = spot.x - { start: 0, middle: width / 2, end: width }[spot.anchor];
      return { left, right: left + width, top: spot.y - HEIGHT, bottom: spot.y };
    };
    const spots = [
      { x: label.px + offset, y: label.py + 4, anchor: "start" },
      { x: label.px - offset, y: label.py + 4, anchor: "end" },
      { x: label.px, y: label.py - offset, anchor: "middle" },
      { x: label.px, y: label.py + offset + HEIGHT - 2, anchor: "middle" },
    ];
    const spot = spots.find(candidate => !placed.some(box => overlaps(boxOf(candidate), box))) || spots[0];
    placed.push(boxOf(spot));
    Object.assign(label, spot);
  }
  return labels;
}

// Frame of a chart with the 30 quarters on x: axes, grid, the rule that marks
// the selected quarter, and a hover and click layer. The caller draws the
// marks into `marks` with the scales `x` (quarter index) and `y`.
function createTimeChart(selector, quarters, { width, height, onHover, onPick }) {
  const margin = { top: 24, right: 78, bottom: 28, left: 40 };
  const last = quarters.length - 1;
  const svg = createSvg(selector, width, height);
  const x = d3.scaleLinear([0, last], [margin.left, width - margin.right]);
  const y = d3.scaleLinear().range([height - margin.bottom, margin.top]);
  const firstQuarters = d3.range(quarters.length).filter(i => quarters[i].slice(5, 7) === "03");

  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickValues(firstQuarters).tickFormat(i => quarters[i].slice(0, 4)).tickSizeOuter(0));
  const yAxis = svg.append("g").attr("class", "axis grid").attr("transform", `translate(${margin.left},0)`);
  const marks = svg.append("g");
  const hoverRule = svg.append("line").attr("class", "hover-rule")
    .attr("y1", margin.top).attr("y2", height - margin.bottom).style("opacity", 0);
  const rule = svg.append("line").attr("class", "rule").attr("y1", margin.top).attr("y2", height - margin.bottom);
  const ruleLabel = svg.append("text").attr("class", "strong").attr("y", margin.top - 8).attr("text-anchor", "middle");

  const quarterAt = event => Math.max(0, Math.min(last, Math.round(x.invert(d3.pointer(event)[0]))));
  svg.append("rect").attr("class", "overlay")
    .attr("x", margin.left).attr("y", margin.top)
    .attr("width", width - margin.left - margin.right).attr("height", height - margin.top - margin.bottom)
    .on("mousemove", event => {
      const quarter = quarterAt(event);
      hoverRule.attr("x1", x(quarter)).attr("x2", x(quarter)).style("opacity", 1);
      onHover(event, quarter);
    })
    .on("mouseleave", () => { hoverRule.style("opacity", 0); hideTooltip(); })
    .on("click", event => onPick(quarterAt(event)));

  return {
    marks, x, y,
    labelX: width - margin.right + 6,
    setDomain(domain) {
      y.domain(domain).nice();
      yAxis.call(d3.axisLeft(y).ticks(5).tickSize(-(width - margin.left - margin.right)));
      yAxis.select(".domain").remove();
    },
    setQuarter(quarter) {
      rule.attr("x1", x(quarter)).attr("x2", x(quarter));
      ruleLabel.attr("x", x(quarter)).text(quarterLabel(quarters[quarter]));
    },
  };
}
