"""Commercial forecast metrics — WAPE-first.

Why this module: MAPE blows up on low-volume SKUs (a 5 Hl miss on a 10 Hl
SKU is a 50% error and dominates the average) which makes the headline
number useless for commercial decisions. WAPE is volume-weighted and
naturally reflects the £-impact of forecast errors at the segment level.

Primary metric:   WAPE = Σ|y - yhat| / Σ|y|
Secondary:        MAE_Hl, bias_Hl, sMAPE, interval coverage

All functions accept numpy arrays. NaN-safe and zero-volume safe.
"""

from __future__ import annotations

import numpy as np


def _as_array(x) -> np.ndarray:
    """Normalize input to float numpy 1-D array."""
    return np.asarray(x, dtype=np.float64).reshape(-1)


def wape(y_true, y_pred) -> float:
    """Volume-weighted absolute percentage error.

    WAPE = Σ|y - ŷ| / Σ|y|. Equivalent to MAE / mean(|y|).
    Treats the segment as one accumulated quantity, so big SKUs dominate
    just as they do in actual revenue impact.
    Returns NaN when total |y| is zero.
    """
    y, p = _as_array(y_true), _as_array(y_pred)
    denom = np.sum(np.abs(y))
    if denom <= 0:
        return float("nan")
    return float(np.sum(np.abs(y - p)) / denom)


def mae(y_true, y_pred) -> float:
    """Mean absolute error in Hl."""
    y, p = _as_array(y_true), _as_array(y_pred)
    if len(y) == 0:
        return float("nan")
    return float(np.mean(np.abs(y - p)))


def bias(y_true, y_pred) -> float:
    """Mean signed error: positive => over-forecasting, negative => under."""
    y, p = _as_array(y_true), _as_array(y_pred)
    if len(y) == 0:
        return float("nan")
    return float(np.mean(p - y))


def smape(y_true, y_pred) -> float:
    """Symmetric MAPE — bounded in [0, 2]. NaN when both y and ŷ are zero."""
    y, p = _as_array(y_true), _as_array(y_pred)
    denom = (np.abs(y) + np.abs(p)) / 2.0
    mask = denom > 0
    if not mask.any():
        return float("nan")
    return float(np.mean(np.abs(y[mask] - p[mask]) / denom[mask]))


def mape(y_true, y_pred) -> float:
    """Classic MAPE — kept for back-compat / regression checks. Use WAPE first."""
    y, p = _as_array(y_true), _as_array(y_pred)
    mask = y > 0
    if not mask.any():
        return float("nan")
    return float(np.mean(np.abs((y[mask] - p[mask]) / y[mask])))


def coverage(y_true, lo, hi) -> float:
    """Fraction of y values inside the [lo, hi] interval."""
    y, l, h = _as_array(y_true), _as_array(lo), _as_array(hi)
    if len(y) == 0:
        return float("nan")
    return float(((y >= l) & (y <= h)).mean())


def all_metrics(y_true, y_pred) -> dict[str, float]:
    """Bundle the 5 key metrics into one dict."""
    return {
        "wape":   wape(y_true, y_pred),
        "mae_hl": mae(y_true, y_pred),
        "bias_hl": bias(y_true, y_pred),
        "smape": smape(y_true, y_pred),
        "mape":  mape(y_true, y_pred),
    }
