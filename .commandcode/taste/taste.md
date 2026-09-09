# Communication & Working Style
See [communication-&-working-style/taste.md](communication-&-working-style/taste.md)
# Architecture & Code Design

- Strongly dislike over-abstraction and unnecessary design patterns (e.g., factory patterns, deep interface layers, bloated registries) where straightforward composition roots or direct instantiation suffices. Confidence: 0.9
- Prioritize explicit, minimal, and caller-extensible API designs over complex layered mechanisms. Confidence: 0.85
- Prefer battle-tested ecosystem libraries (e.g., standard rate limiters like token bucket / Redis-backed solutions) over rolling custom, incomplete implementations. Confidence: 0.85
- Value comprehensive observability, structured logging, and thorough testability (including integration and contract tests) as critical architectural requirements. Confidence: 0.85
- For web↔backend integration, prefers direct browser-to-API communication (client islands fetch the backend REST API directly, accepting CORS setup and shared parent-domain cookies) over adding a server-side proxy/BFF layer — explicitly chose this over the agent's recommended proxy option. Confidence: 0.65

# Tooling & Workflow
See [tooling-&-workflow/taste.md](tooling-&-workflow/taste.md)
