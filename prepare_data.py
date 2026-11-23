# /// script
# requires-python = ">=3.10"
# dependencies = ["pandas", "scipy"]
# ///
"""Derive the tables the d3 prototype loads from the 13F export.

Run with:  uv run prepare_data.py
Reads positions.csv and investor_quarter.csv from ../dataviz_13f and writes
five small CSV files to data/.
"""
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import leaves_list, linkage, optimal_leaf_ordering
from scipy.spatial.distance import squareform

SOURCE = Path(__file__).parent.parent / "dataviz_13f"
TARGET = Path(__file__).parent / "data"

HISTORY_QUARTERS = 8    # window that defines the usual net buying of a stock
MIN_SD = 1.0            # floor for the standard deviation, in investors
MIN_HOLDERS_Z = 5       # net_buying_z only for stocks with this many holders
MIN_PEAK_HOLDERS = 3    # stocks that never reach this are not shipped
NEAR_EMPTY_RATIO = 0.3  # a quarter under 30 % of both neighbours is incomplete
ACTIVITY_SIGN = {"Buy": 1, "Add": 1, "Reduce": -1, "Sell": -1}


def artefact_quarters(investor_quarter):
    """Return the (period_end, investor_name) pairs whose activity is fake.

    A near-empty filing looks like a wave of Sells in that quarter and a wave
    of Buys in the next one, so both quarters are returned.
    """
    counts = investor_quarter.pivot(
        index="period_end", columns="investor_name", values="n_positions")
    near_empty = ((counts < NEAR_EMPTY_RATIO * counts.shift(1))
                  & (counts < NEAR_EMPTY_RATIO * counts.shift(-1)))
    affected = near_empty | near_empty.shift(1, fill_value=False)
    return affected.stack().loc[lambda flag: flag].index


def stock_quarters(positions, excluded):
    """Holders, net buying and its z-score per stock and quarter."""
    held = positions[positions.ticker.notna()]
    keys = pd.MultiIndex.from_frame(held[["period_end", "investor_name"]])
    sign = held.activity.map(ACTIVITY_SIGN).fillna(0).where(~keys.isin(excluded), 0)
    grouped = held.assign(holder=held.value_usd > 0, net=sign).groupby(
        ["ticker", "period_end"])
    holders = grouped.holder.sum().unstack(fill_value=0)
    net = grouped.net.sum().unstack(fill_value=0)

    history = net.T.shift(1).rolling(HISTORY_QUARTERS)
    usual_mean = history.mean().T
    usual_sd = history.std().T.clip(lower=MIN_SD)
    z = ((net - usual_mean) / usual_sd).where(holders >= MIN_HOLDERS_Z)

    table = pd.DataFrame({
        "n_investors": holders.stack(),
        "net_buying": net.stack().astype(int),
        "usual_mean": usual_mean.stack(future_stack=True).round(2),
        "usual_sd": usual_sd.stack(future_stack=True).round(2),
        "net_buying_z": z.stack(future_stack=True).round(2),
    })
    shipped = holders.index[holders.max(axis=1) >= MIN_PEAK_HOLDERS]
    active = (table.n_investors > 0) | (table.net_buying != 0)
    table = table[active].loc[shipped].reset_index()
    table.loc[table.net_buying_z.isna(), ["usual_mean", "usual_sd"]] = np.nan

    labels = (held.sort_values("period_end").groupby("ticker")[["company", "sector"]]
              .last().loc[shipped].reset_index())
    return table, labels


def portfolio_overlap(positions):
    """Sum over shared securities of min(pct_A, pct_B), per pair and quarter."""
    live = positions[positions.value_usd > 0]
    rows = []
    for period, quarter in live.groupby("period_end"):
        weights = quarter.pivot(
            index="investor_name", columns="cusip", values="pct_portfolio").fillna(0)
        names, matrix = weights.index, weights.to_numpy()
        for i, name in enumerate(names[:-1]):
            shared = np.minimum(matrix[i], matrix[i + 1:]).sum(axis=1)
            rows.extend((period, name, other, value)
                        for other, value in zip(names[i + 1:], shared))
    return pd.DataFrame(rows, columns=["period_end", "a", "b", "overlap"])


def investor_layout(overlap, names):
    """Matrix order (hierarchical clustering) and 2D map (classical MDS).

    Both use the mean overlap of a pair over the quarters in which both filed,
    so the layout does not jump when the user changes the quarter.
    """
    mean = overlap.groupby(["a", "b"]).overlap.mean()
    similarity = mean.unstack().reindex(index=names, columns=names).fillna(0)
    similarity = np.maximum(similarity, similarity.T).to_numpy()
    distance = 100 - similarity
    np.fill_diagonal(distance, 0)

    condensed = squareform(distance, checks=False)
    tree = linkage(condensed, method="average")
    order = leaves_list(optimal_leaf_ordering(tree, condensed))

    centering = np.eye(len(names)) - 1 / len(names)
    values, vectors = np.linalg.eigh(-0.5 * centering @ distance ** 2 @ centering)
    coordinates = vectors[:, -2:] * np.sqrt(values[-2:])

    return pd.DataFrame({
        "investor_name": names,
        "matrix_order": np.argsort(order),
        "map_x": coordinates[:, 1].round(2),
        "map_y": coordinates[:, 0].round(2),
    })


def main():
    positions = pd.read_csv(SOURCE / "positions.csv")
    investor_quarter = pd.read_csv(SOURCE / "investor_quarter.csv")
    TARGET.mkdir(exist_ok=True)

    excluded = artefact_quarters(investor_quarter)
    stock_quarter, stocks = stock_quarters(positions, excluded)
    overlap = portfolio_overlap(positions)
    names = sorted(positions.investor_name.unique())
    investors = investor_layout(overlap, names)

    investor_id = {name: i for i, name in enumerate(names)}
    pairs = overlap[overlap.overlap >= 0.05].assign(
        a=lambda t: t.a.map(investor_id),
        b=lambda t: t.b.map(investor_id),
        overlap=lambda t: t.overlap.round(1))

    tables = {
        "stocks.csv": stocks,
        "stock_quarter.csv": stock_quarter,
        "investors.csv": investors,
        "investor_quarter.csv": investor_quarter,
        "overlap.csv": pairs,
    }
    for name, table in tables.items():
        table.to_csv(TARGET / name, index=False)
        size = (TARGET / name).stat().st_size / 1e6
        print(f"{name:<22}{len(table):>8} rows {size:6.2f} MB")
    print("excluded from net buying:", sorted(excluded))


if __name__ == "__main__":
    main()
