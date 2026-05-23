# Agentic Layer — design spec

The LLM/agent layer is what turns numeric output into *commercial recommendations a director can act on*. This doc defines the model, tools, schemas, prompts, and streaming contract.

---

## 🤖 Models (HF Inference Providers)

| Role | Model | Provider | Why |
|---|---|---|---|
| **Primary** | `moonshotai/Kimi-K2.6` | Novita | 1.1T params, strong agentic reasoning, latest in K2 family. Great at tool-call orchestration. |
| **Fallback** | `meta-llama/Llama-3.3-70B-Instruct` | Groq | Fast, cheap, more than enough for structured output. Trigger when Kimi 429s or latency >5s. |
| Embeddings (if RAG added) | `BAAI/bge-m3` | HF Inference | Multilingual SOTA. |

The fallback switch is a single env flag: `LLM_PRIMARY=kimi|llama`. Both clients share the same `InferenceClient` API.

```python
from huggingface_hub import InferenceClient
import os

MODELS = {
    "kimi":  "moonshotai/Kimi-K2.6",
    "llama": "meta-llama/Llama-3.3-70B-Instruct",
}

def get_client() -> InferenceClient:
    model = MODELS[os.getenv("LLM_PRIMARY", "kimi")]
    return InferenceClient(model=model, token=os.environ["HF_TOKEN"])
```

---

## 🧰 Tool catalog (smolagents)

Tools are plain Python functions decorated with `@tool`. smolagents passes the docstring as the tool description to the model. Keep docstrings tight — they go into the system prompt.

```python
from smolagents import tool
from app.schemas import (
    ForecastSeries, GapItem, Driver, PromoROI,
    SimulationResult, AnomalyEvent,
)

@tool
def forecast(sku: str, channel: str, horizon_months: int = 3) -> ForecastSeries:
    """Forecast Hl volume for a SKU on a channel over the next N months.
    Returns point forecast plus 80% and 95% prediction intervals."""

@tool
def compare_vs_budget(sku: str, channel: str, period: str) -> GapItem:
    """Return forecast vs budget for a SKU/channel in a given month (e.g. 'Nov.26').
    Includes absolute gap (Hl) and gap %."""

@tool
def explain_gap(sku: str, channel: str, period: str, top_k: int = 3) -> list[Driver]:
    """Return the top-K SHAP-based drivers of the gap for a SKU/channel/period."""

@tool
def simulate_promo(
    sku: str,
    channel: str,
    months: list[str],
    discount_pct: float,
    promo_type: str = "multi-pack",
) -> SimulationResult:
    """Re-run the forecast assuming a promo with given discount and type runs in
    the given months. Returns the new forecast, the new gap, and gap_closed_pct."""

@tool
def rank_promos(channel: str | None = None, top_k: int = 10) -> list[PromoROI]:
    """Rank historical promotions by ROI (causal lift × revenue per Hl - promo cost).
    Filter by channel if provided. Highest ROI first."""

@tool
def anomalies(sku: str, channel: str, lookback_months: int = 12) -> list[AnomalyEvent]:
    """Detect anomalies (|z| > 2) in past sales for a SKU/channel.
    Each event has period, z-score, and a candidate cause from feature deltas."""

@tool
def meta_lookup(kind: str) -> list[str]:
    """List available values for a metadata field: 'brand', 'sku', 'channel',
    'subchannel', 'period'. Used by the agent to ground SKU/channel names."""
```

Every tool returns a **Pydantic model**, never a free-form string. The agent therefore sees typed JSON and can chain calls without parsing.

---

## 📦 Pydantic schemas

All schemas live in `backend/app/schemas/` and are reused as:
1. FastAPI request/response models (auto-published in `/openapi.json`)
2. Instructor schemas for the LLM (structured output)
3. TypeScript types on the frontend (via `openapi-typescript`)

```python
# schemas/forecast.py
from pydantic import BaseModel, Field
from datetime import date

class ForecastPoint(BaseModel):
    period: str              # "Nov.26"
    period_start: date
    point: float             # Hl
    lo80: float
    hi80: float
    lo95: float
    hi95: float
    is_actual: bool = False  # true for historical months

class ForecastSeries(BaseModel):
    sku: str
    channel: str
    granularity: str = Field(pattern="^(month|week)$")
    points: list[ForecastPoint]


# schemas/gap.py
class GapItem(BaseModel):
    sku: str
    channel: str
    period: str
    forecast_hl: float
    budget_hl: float
    gap_hl: float          # forecast - budget
    gap_pct: float         # gap_hl / budget_hl
    confidence: str = Field(pattern="^(low|medium|high)$")


# schemas/drivers.py
class Driver(BaseModel):
    feature: str           # human label, e.g. "Promo coverage weeks 46-47"
    shap_value: float      # signed contribution in Hl
    direction: str = Field(pattern="^(positive|negative)$")
    explanation: str       # one-sentence natural-language explanation


# schemas/promos.py
class PromoROI(BaseModel):
    promo_type: str        # e.g. "Multi-pack 4x330ml"
    channel: str
    avg_lift_pct: float    # from CausalImpact
    avg_lift_hl: float
    estimated_cost: float | None
    roi: float | None      # null if cost unknown
    n_observations: int
    confidence: str = Field(pattern="^(low|medium|high)$")


# schemas/simulation.py
class SimulationRequest(BaseModel):
    sku: str
    channel: str
    months: list[str]
    discount_pct: float = Field(ge=0, le=100)
    promo_type: str = "multi-pack"

class SimulationResult(BaseModel):
    baseline: ForecastSeries
    simulated: ForecastSeries
    gap_before_hl: float
    gap_after_hl: float
    gap_closed_pct: float
    estimated_cost: float | None
    notes: str             # short LLM-generated rationale


# schemas/anomaly.py
class AnomalyEvent(BaseModel):
    sku: str
    channel: str
    period: str
    actual_hl: float
    expected_hl: float
    z_score: float
    candidate_cause: str   # e.g. "Weather: temp -3.2°C vs. typical"


# schemas/recommendation.py — THE money schema
class RecommendationAction(BaseModel):
    action: str            # short imperative: "Extend multi-pack promo to weeks 47-48"
    target_sku: str
    target_channel: str
    target_months: list[str]
    expected_lift_hl: float
    expected_gap_closed_pct: float
    estimated_cost: float | None
    confidence: str = Field(pattern="^(low|medium|high)$")
    evidence: list[str]    # 1-3 short evidence bullets ("Historical lift +9% on similar promo")

class RecommendationScenario(BaseModel):
    label: str = Field(pattern="^(conservative|balanced|aggressive)$")
    headline: str          # one-line summary for the card
    actions: list[RecommendationAction]
    total_expected_gap_closed_pct: float
    risk_notes: str

class RecommendationResponse(BaseModel):
    sku: str
    channel: str
    period: str
    current_gap_hl: float
    current_gap_pct: float
    scenarios: list[RecommendationScenario]   # always length 3


# schemas/explain.py
class ExplainViewRequest(BaseModel):
    page: str              # "overview" | "forecast" | "drivers" | ...
    filters: dict          # current brand/SKU/channel/period
    visible_state: dict    # serialized chart data the user is looking at

class ExplainViewSummary(BaseModel):
    headline: str
    bullets: list[str] = Field(min_length=3, max_length=3)
    suggested_next_action: str | None
```

---

## 🧠 System prompt (Kimi K2.6 / Llama 3.3)

```
You are MarketPulse, a commercial analyst for Damm UK. You help the UK
commercial team understand why monthly sales forecasts deviate from budget
and recommend concrete actions to close the gap.

CONSTRAINTS
- Damm data is confidential. NEVER mention real supermarket or customer
  names. Refer to channels generically: "off-trade grocery", "discount",
  "premium grocery", "convenience". If a tool returns a retailer name, map
  it before showing the user.
- All volumes are in hectoliters (Hl). All currency is GBP.
- All time periods follow the convention "MMM.YY" in Spanish abbreviations
  (Ene, Feb, Mar, Abr, May, Jun, Jul, Ago, Sep, Oct, Nov, Dic). Translate
  to English month names in your output ("November 2026").
- Be specific. Vague answers are useless to a commercial director.
- Cite numbers from the tools. Do not invent figures.

WORKFLOW
1. Identify the SKU/channel/period the user is asking about. If unclear,
   call meta_lookup to ground the names.
2. Get the gap with compare_vs_budget.
3. Explain the gap with explain_gap (top drivers).
4. If recommending action, call rank_promos and simulate_promo before
   suggesting a specific promo. Never recommend a promo without a
   simulated gap_closed_pct.
5. Return structured output matching the requested Pydantic schema.

STYLE
- Direct, executive tone. Short sentences.
- Lead with the number, then the reason, then the action.
- Use bullet points for evidence, not paragraphs.
```

---

## 📝 Prompt templates

### 3-scenario recommendation (`/api/recommend` body endpoint)

System prompt above + user message:

```
SKU: {sku}
Channel: {channel}
Period: {period}

Current gap: {gap_hl:.0f} Hl ({gap_pct:+.1%}) vs budget {budget_hl:.0f} Hl.

Top drivers: {drivers_json}
Top historical promos by ROI on this channel: {promo_roi_json}

Generate exactly THREE scenarios — conservative, balanced, aggressive —
each closing more of the gap with more risk/cost. For every action you
propose, you MUST have called simulate_promo first and use the returned
gap_closed_pct as the expected_gap_closed_pct.

Output JSON matching the RecommendationResponse schema.
```

The Instructor wrapper enforces the schema:

```python
import instructor
from huggingface_hub import InferenceClient

client = instructor.from_openai(
    InferenceClient(model=MODELS["kimi"], token=HF_TOKEN).as_openai(),
    mode=instructor.Mode.JSON,
)

resp: RecommendationResponse = client.chat.completions.create(
    response_model=RecommendationResponse,
    messages=[
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user",   "content": user_msg},
    ],
)
```

### "Explain this view" (`/api/explain-view`)

```
The user is on the {page} page with these filters:
{filters_json}

They are looking at this visible state:
{visible_state_json}

In three bullets aimed at a commercial director:
1. State the headline takeaway.
2. State the most important driver.
3. State the most important consequence or risk.

Then suggest one concrete next action (or null if none is warranted).

Output JSON matching the ExplainViewSummary schema.
```

### Chat (smolagents `CodeAgent` running against `/api/chat`)

The agent uses smolagents' code-agent paradigm: model writes Python that
calls the tools above. We expose a deliberately small Python sandbox —
only the tool functions and stdlib. The system prompt is the one above
plus smolagents' default code-agent suffix.

---

## 🌊 SSE streaming format (`/api/chat`)

The frontend's chat (Vercel AI SDK `useChat`) expects an SSE stream. We emit
typed events so the UI can render tool-call breadcrumbs and partial answers.

```
event: thought
data: {"text": "Looking up the gap for SKU X in November..."}

event: tool_call
data: {"name": "compare_vs_budget", "args": {"sku":"X","channel":"Y","period":"Nov.26"}}

event: tool_result
data: {"name": "compare_vs_budget", "result_summary": "Gap -120 Hl (-4.2%)"}

event: token
data: {"text": "The "}

event: token
data: {"text": "November "}

...

event: done
data: {}
```

FastAPI implementation sketch:

```python
from fastapi.responses import StreamingResponse

@router.post("/api/chat")
async def chat(req: ChatRequest):
    async def stream():
        async for ev in run_agent(req.messages):
            yield f"event: {ev.type}\ndata: {ev.json()}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")
```

On the frontend, render each `tool_call` as a small grey chip in the message
bubble; `tool_result` updates the chip from "running…" to its `result_summary`.

---

## 🛡️ Failure modes & fallbacks

| Failure | Detection | Fallback |
|---|---|---|
| Kimi 429 / >5s latency | `httpx` timeout / status | Switch `LLM_PRIMARY=llama` for this request |
| LLM hallucinated SKU not in master | Validate against `meta_lookup` | Re-prompt with `Available SKUs: [...]` |
| LLM JSON doesn't match schema | Instructor retries with validation error in context | After 2 retries, return canned "couldn't generate, here is the raw forecast" |
| Tool returned empty (e.g. no past promos on channel) | Empty list check in tool | Agent told: "No historical promos on this channel — recommend conservatively" |
| HF Inference down | Health-check on `/api/meta` | Switch every endpoint to **snapshot mode** (pre-baked Parquet recs) |
| All else fails | — | Hardcoded recommendation per hero SKU in `backend/app/services/agent.py:HERO_FALLBACK` |

---

## ✅ Definition of done (agent slice)

- [ ] `moonshotai/Kimi-K2.6` reachable via `InferenceClient` with the org HF token
- [ ] All 7 tools implemented and unit-tested with mocked services
- [ ] All Pydantic schemas in `backend/app/schemas/`, re-used by Instructor + FastAPI
- [ ] `/api/recommend` returns valid `RecommendationResponse` 100% of the time (Instructor + retries)
- [ ] `/api/explain-view` returns 3 bullets + next action
- [ ] `/api/chat` SSE stream emits typed events; FE renders tool-call chips
- [ ] Fallback to Llama-3.3 toggles on a single env flag and is exercised at H22 rehearsal
- [ ] Hero-SKU canned fallback exists and renders identically to a live response
