# Adding a new LLM provider

Two things to add: a **brain service** (transport layer) and optionally a **model provider** (model discovery for the API).

## Step 1 — Brain service

Create `core/brain/my_backend_service.py`:

```python
import os
import time
from openai import OpenAI
from core.brain.interface import AgentBrainServiceInterface, BrainResponse

class AgentBrainMyBackendService(AgentBrainServiceInterface):

    def __init__(self, api_key: str | None = None, timeout: int = 120):
        key = api_key or os.environ.get("MY_BACKEND_API_KEY", "")
        if not key:
            raise ValueError("MY_BACKEND_API_KEY is not set")
        self.client = OpenAI(
            base_url="https://api.mybackend.com/v1",
            api_key=key,
            timeout=timeout,
        )

    def send(self, messages, model, temperature=0.7, top_p=0.9, max_tokens=256):
        start = time.monotonic()
        response = self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
        )
        elapsed_ms = int((time.monotonic() - start) * 1000)
        content = response.choices[0].message.content or ""
        return BrainResponse(
            content=content,
            response_time_ms=elapsed_ms,
            model_used=model,
            raw_response=response,
        )

    def health_check(self):
        try:
            self.client.models.list()
            return True
        except Exception:
            return False
```

The interface has only 2 methods:
- `send(messages, model, temperature, top_p, max_tokens)` -> `BrainResponse`
- `health_check()` -> `bool`

`BrainResponse` fields: `content` (str), `response_time_ms` (int), `model_used` (str), `raw_response` (Any).

If the backend exposes an OpenAI-compatible API, you can use the `openai` Python SDK as shown above. Otherwise, use `httpx` or `requests` directly.

## Step 2 — Register in factory

In `core/brain/factory.py`, add your backend:

```python
def create_brain(backend: str, **kwargs) -> AgentBrainServiceInterface:
    if backend == "local":
        from core.brain.local_service import AgentBrainLocalService
        return AgentBrainLocalService(**kwargs)
    elif backend == "groq":
        from core.brain.groq_service import AgentBrainGroqService
        return AgentBrainGroqService(**kwargs)
    elif backend == "openrouter":
        from core.brain.openrouter_service import AgentBrainOpenRouterService
        return AgentBrainOpenRouterService(**kwargs)
    elif backend == "my_backend":  # <-- add this
        from core.brain.my_backend_service import AgentBrainMyBackendService
        return AgentBrainMyBackendService(**kwargs)
    else:
        raise ValueError(f"Unknown brain backend: '{backend}'")
```

The backend name is used in `model_id` format: `"my_backend/model-name"`. The worker splits on `/` to get the backend and model name.

## Step 3 — Model provider (optional)

If you want the API to list available models from your backend, create `core/models_registry/my_provider.py`:

```python
import os
from openai import OpenAI
from core.models_registry.registry import ModelInfo

class MyBackendModelProvider:

    def __init__(self):
        key = os.environ.get("MY_BACKEND_API_KEY", "")
        self.client = OpenAI(
            base_url="https://api.mybackend.com/v1",
            api_key=key,
        ) if key else None

    def list_models(self):
        if not self.client:
            return []
        try:
            response = self.client.models.list()
            return [
                ModelInfo(
                    model_id=f"my_backend/{m.id}",
                    display_name=m.id,
                    backend="my_backend",
                    context_length=getattr(m, "context_window", None),
                    owned_by=getattr(m, "owned_by", None),
                )
                for m in response.data
            ]
        except Exception:
            return []
```

Then register in `core/main.py`:

```python
from core.models_registry.my_provider import MyBackendModelProvider
model_registry.add_provider(MyBackendModelProvider())
```

## Step 4 — Environment variable

Add your API key to `.env`:

```
MY_BACKEND_API_KEY=sk-...
```

## Usage

In a match request, use `model_id: "my_backend/model-name"`:

```json
{
  "players": [{
    "model_id": "my_backend/my-model-7b",
    ...
  }]
}
```

The worker parses `"my_backend/my-model-7b"` → backend=`"my_backend"`, model=`"my-model-7b"` → calls `create_brain("my_backend")` → your service handles the rest.
