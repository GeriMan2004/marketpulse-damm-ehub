"""Simple baselines — the floor every ML model must clear.

If LightGBM cannot beat seasonal-naive on WAPE, we have a problem: the
ML approach is adding error rather than reducing it. These baselines run
in milliseconds, so they always belong in the validation pool.

Each function takes a 1-D `history` (ordered oldest → newest) and returns
a `horizon`-length forecast array.
"""

from __future__ import annotations

import numpy as np


def naive(history: np.ndarray, horizon: int) -> np.ndarray:
    """Last observed value, repeated. Strong baseline for stable series."""
    if len(history) == 0:
        return np.zeros(horizon, dtype=np.float64)
    return np.full(horizon, float(history[-1]), dtype=np.float64)


def seasonal_naive(history: np.ndarray, horizon: int, season: int = 12) -> np.ndarray:
    """Same month last year. Works well for products with annual seasonality.

    Falls back to plain naive when history < `season`.
    """
    h = np.asarray(history, dtype=np.float64)
    if len(h) < season:
        return naive(h, horizon)
    out = np.empty(horizon, dtype=np.float64)
    for i in range(horizon):
        # i=0 → first forecast month → look at history[-season + 0] etc.
        idx = -season + (i % season)
        out[i] = h[idx]
    return out


def moving_average(history: np.ndarray, horizon: int, window: int) -> np.ndarray:
    """Mean of the trailing `window` observations, repeated.

    Smooths over noise; fails on trended or seasonal series. Useful as a
    smoothness-floor baseline for low-volume SKUs.
    """
    h = np.asarray(history, dtype=np.float64)
    if len(h) == 0:
        return np.zeros(horizon, dtype=np.float64)
    w = min(window, len(h))
    val = float(np.mean(h[-w:]))
    return np.full(horizon, val, dtype=np.float64)


def ma3(history: np.ndarray, horizon: int) -> np.ndarray:
    return moving_average(history, horizon, 3)


def ma6(history: np.ndarray, horizon: int) -> np.ndarray:
    return moving_average(history, horizon, 6)


BASELINES: dict[str, callable] = {
    "naive": naive,
    "snaive": seasonal_naive,
    "ma3": ma3,
    "ma6": ma6,
}
