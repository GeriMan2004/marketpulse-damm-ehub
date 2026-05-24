# LLM And Agent Layer

The LLM layer turns model outputs into business-readable explanations and recommended actions.

The numeric source of truth remains the Parquet-backed backend. LLMs do not create forecasts.

## Current LLM Router

Code:

```text
backend/app/services/llm.py
```

Profiles:

| Profile | Model | Provider | Current use |
|---|---|---|---|
| `fast` | `meta-llama/Llama-3.3-70B-Instruct` | Groq | low-latency explain/chat style calls |
| `deep` | `moonshotai/Kimi-K2-Instruct` | Novita | recommendation and brief generation |
| `fallback` | `Qwen/Qwen2.5-72B-Instruct` | HF auto | fallback after provider errors |

Token resolution:

1. `HF_TOKEN` from environment or `backend/.env`
2. `~/.cache/huggingface/token`

## LLM-Backed Endpoints

| Endpoint | Role | Fallback |
|---|---|---|
| `/api/recommend` | Generates 3 commercial scenarios for one SKU x channel x period | deterministic scenario set |
| `/api/explain-view` | Summarizes visible dashboard state | deterministic generic summary |
| `/api/brief` | Generates customer-call brief content | deterministic brief text |
| `/api/chat` | Conversational route | depends on router behavior |

## Recommendation Flow

Endpoint:

```text
POST /api/recommend
```

Input:

```json
{
  "sku": "EX23SRAN",
  "sub_channel": "GROCERY",
  "period": "Jul.26"
}
```

The backend builds context from:

- `forecast.parquet`
- `targets.parquet`
- `drivers.parquet`
- `promo_roi.parquet`

Then asks the `deep` profile for exactly three scenarios:

- conservative
- balanced
- aggressive

If the LLM call fails or returns invalid JSON, the endpoint returns deterministic fallback scenarios. This is why the UI can still show "Pick a play" without live LLM access.

## What The LLM May And May Not Do

Allowed:

- summarize forecast/gap/drivers
- generate concise business language
- recommend possible actions using provided context
- structure scenario text

Not allowed:

- invent customer or supermarket names
- invent new forecast values
- hide uncertainty
- claim official budget when target is derived
- claim promo lift that is not in provided ROI context

## Generated Types

Schemas live in:

```text
backend/app/schemas/
```

Frontend types are generated from FastAPI OpenAPI:

```bash
make types
```

Output:

```text
web/src/lib/api.gen.ts
```

## Important Caveat

The code imports `smolagents`, and older docs described a tool-calling agent catalog. The current main dashboard flow does not depend on a full smolagents tool loop. The implemented production routes are standard FastAPI endpoints that gather context server-side and call the selected LLM profile when needed.
