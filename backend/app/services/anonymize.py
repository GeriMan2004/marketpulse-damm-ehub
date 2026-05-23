"""Anonymization map for customer/retailer names.

The brief forbids real supermarket/customer names in the demo. Every name we
might surface gets mapped to a stable, generic label. Anything not in the
explicit map gets a deterministic hash-based label (via PYTHONHASHSEED=42 —
set by the Makefile so labels are reproducible across runs and across machines).

See DATA.md §5 for the rationale.
"""

from __future__ import annotations

# Explicit mappings — order matters only for documentation, not behavior
ANON_MAP: dict[str, str] = {
    # Retailers (Agrupacion BU3 + promo file sheet names)
    "TESCO PLC":                            "Grocer A",
    "J SAINSBURY":                          "Grocer B",
    "ASDA STORES LIMITED":                  "Grocer C",
    "WM MORRISONS":                         "Grocer D",
    "WAITROSE":                             "Grocer E",
    "ALDI STORES LTD - ATHERSTONE":         "Discounter A",
    "LIDL GREAT BRITAIN LIMITED":           "Discounter B",
    "THE CO-OPERATIVE GROUP":               "Convenience A",
    # B2B distribution (single biggest UK relationship — ~40% of volume)
    "CMBC":                                 "Distributor (B2B)",
    # On-trade groups (pubs)
    "YOUNGS PLC":                           "Pubco A",
    "GREENE KING BREWING & RETAILING LTD":  "Pubco B",
    "MARSTON'S":                            "Pubco C",
    "BUTCOMBE BREWING CO":                  "Pubco D",
    # Wholesalers
    "MCW":                                  "Wholesaler A",
    "LWC/60":                               "Wholesaler B",
    "C&D WINES LTD.":                       "Wholesaler C",
}

# Promo file sheet name → anonymized retailer label (the sheet name is what
# appears in the trade plan headers; same target as the BU3 row above)
PROMO_SHEET_MAP: dict[str, str] = {
    "Tesco":       "Grocer A",
    "Sainsbury's": "Grocer B",
    "Waitrose":    "Grocer E",
    "Morrisons":   "Grocer D",
    "Asda":        "Grocer C",
}


def anonymize(raw_name: str | None) -> str:
    """Map a raw customer/retailer name to a generic label.

    Behavior:
    - Exact match in ANON_MAP → that label.
    - Otherwise → "Customer NNN" with NNN = hash(name) % 1000.
    - None / empty → "Unknown".

    The hash uses Python's built-in `hash()`, which is seed-stable when
    PYTHONHASHSEED is set (the Makefile pins it to 42 for the `PY` var).
    """
    if not raw_name:
        return "Unknown"
    name = raw_name.strip()
    if not name:
        return "Unknown"
    if name in ANON_MAP:
        return ANON_MAP[name]
    return f"Customer {abs(hash(name)) % 1000:03d}"


def anonymize_promo_sheet(sheet_name: str) -> str:
    """Promo file sheet names have trailing spaces sometimes ('Waitrose '),
    so we normalize before lookup."""
    key = sheet_name.strip().rstrip(",")
    return PROMO_SHEET_MAP.get(key, anonymize(key))


# ────────────────────────────────────────────────────────────────────────────
# Display labels for raw codes — used by the frontend
# ────────────────────────────────────────────────────────────────────────────

SUB_CHANNEL_LABELS: dict[str, str] = {
    "GROCERY":                 "Off-trade grocery",
    "FREE TRADE CMBC":         "B2B distributor",
    "NATIONAL ON TRADE":       "National on-trade",
    "FREE TRADE":              "Independent on-trade",
    "CONVENIENCE & WHOLESALE": "Convenience & wholesale",
    "MDD COPACKING":           "Co-packing",
}

SALES_CHANNEL_LABELS: dict[str, str] = {
    "ON TRADE":         "On-trade",
    "OFF TRADE":        "Off-trade",
    "MDD CO-PACKING":   "Co-packing",
}

SPANISH_MONTHS: dict[str, str] = {
    "Ene": "January",  "Feb": "February", "Mar": "March",   "Abr": "April",
    "May": "May",      "Jun": "June",     "Jul": "July",    "Ago": "August",
    "Sep": "September","Oct": "October",  "Nov": "November","Dic": "December",
}


def sub_channel_label(raw: str | None) -> str:
    """`GROCERY` → `Off-trade grocery`. Unknown values pass through."""
    if not raw:
        return "Unknown"
    return SUB_CHANNEL_LABELS.get(raw.strip(), raw.strip())


def sales_channel_label(raw: str | None) -> str:
    if not raw:
        return "Unknown"
    return SALES_CHANNEL_LABELS.get(raw.strip(), raw.strip())


def period_label(period: str | None) -> str:
    """`Nov.26` → `November 2026`. `2026-11-01` → `November 2026`."""
    if not period:
        return ""
    p = str(period).strip()
    # `Nov.26` format
    if "." in p and len(p.split(".")) == 2:
        m, y = p.split(".")
        m3 = m[:3]
        if m3 in SPANISH_MONTHS and y.isdigit():
            year = 2000 + int(y) if int(y) < 100 else int(y)
            return f"{SPANISH_MONTHS[m3]} {year}"
    # ISO date YYYY-MM-DD or YYYY-MM
    if "-" in p:
        parts = p.split("-")
        if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
            year, month = int(parts[0]), int(parts[1])
            months = ["January","February","March","April","May","June",
                      "July","August","September","October","November","December"]
            if 1 <= month <= 12:
                return f"{months[month-1]} {year}"
    return p
