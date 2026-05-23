"""Conformalized Quantile Regression (CQR) — distribution-free PI calibration.

Reference: Romano, Patterson, Candes "Conformalized Quantile Regression" (2019).

Given quantile predictions [q_lo, q_hi] at level α, compute a per-row score
on a held-out calibration set:
    score = max(q_lo - y, y - q_hi)
The (1 - α)-th quantile of these scores (with finite-sample correction)
becomes the additive correction `qhat`. At inference time, calibrated
intervals are [q_lo - qhat, q_hi + qhat]. This gives marginal coverage
≥ (1 - α) on iid data.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

import numpy as np


@dataclass(frozen=True)
class CalibrationReport:
    qhat: float
    target_level: float
    raw_coverage: float
    cal_coverage: float
    raw_width: float
    cal_width: float
    n_calibration: int


def conformal_qhat(
    y_calib: np.ndarray,
    q_lo_calib: np.ndarray,
    q_hi_calib: np.ndarray,
    target_level: float = 0.8,
) -> float:
    """Compute the conformal quantile (additive correction)."""
    if len(y_calib) == 0:
        raise ValueError("conformal_qhat received empty calibration set")
    scores = np.maximum(q_lo_calib - y_calib, y_calib - q_hi_calib)
    n = len(scores)
    q_level = min(np.ceil((n + 1) * target_level) / n, 1.0)
    return float(np.quantile(scores, q_level, method="higher"))


def coverage(y: np.ndarray, lo: np.ndarray, hi: np.ndarray) -> float:
    """Empirical coverage proportion of y inside [lo, hi]."""
    if len(y) == 0:
        return float("nan")
    return float(((y >= lo) & (y <= hi)).mean())


def calibrate(
    y_calib: np.ndarray, q_lo_calib: np.ndarray, q_hi_calib: np.ndarray,
    y_test: np.ndarray,  q_lo_test: np.ndarray,  q_hi_test: np.ndarray,
    target_level: float = 0.8,
) -> CalibrationReport:
    """End-to-end CQR: fit qhat on calib, evaluate raw + cal coverage on test."""
    qhat = conformal_qhat(y_calib, q_lo_calib, q_hi_calib, target_level)
    raw_cov = coverage(y_test, q_lo_test, q_hi_test)
    cal_cov = coverage(y_test, q_lo_test - qhat, q_hi_test + qhat)
    return CalibrationReport(
        qhat=qhat, target_level=target_level,
        raw_coverage=raw_cov, cal_coverage=cal_cov,
        raw_width=float(np.mean(q_hi_test - q_lo_test)),
        cal_width=float(np.mean((q_hi_test + qhat) - (q_lo_test - qhat))),
        n_calibration=int(len(y_calib)),
    )


def per_group_qhats(
    groups_calib: np.ndarray,  # e.g. sub_channel labels for each calib row
    y_calib: np.ndarray, q_lo_calib: np.ndarray, q_hi_calib: np.ndarray,
    target_level: float = 0.8,
    *, min_rows: int = 20,
    pool_label: str = "__default__",
) -> Mapping[str, float]:
    """Per-channel (or per-group) conformal qhats.

    Channels with fewer than `min_rows` calibration rows fall back to a
    pooled qhat computed from all rows in the under-sized groups together.
    The returned dict always contains a `pool_label` key for the default.
    """
    unique = np.unique(groups_calib)
    out: dict[str, float] = {}
    pooled_y, pooled_lo, pooled_hi = [], [], []
    for g in unique:
        mask = groups_calib == g
        if mask.sum() >= min_rows:
            out[str(g)] = conformal_qhat(
                y_calib[mask], q_lo_calib[mask], q_hi_calib[mask], target_level
            )
        else:
            pooled_y.append(y_calib[mask])
            pooled_lo.append(q_lo_calib[mask])
            pooled_hi.append(q_hi_calib[mask])
    if pooled_y:
        out[pool_label] = conformal_qhat(
            np.concatenate(pooled_y),
            np.concatenate(pooled_lo),
            np.concatenate(pooled_hi),
            target_level,
        )
    else:
        # Fall back to overall qhat if every group has enough rows
        out[pool_label] = conformal_qhat(
            y_calib, q_lo_calib, q_hi_calib, target_level,
        )
    return out
