---
name: OpenAPI codegen compatibility
description: Portable schema choices for this workspace's Orval and Zod setup
---

For the current workspace codegen setup, server-side generated Zod uses the installed Zod 3 runtime and does not include DOM globals. OpenAPI binary file schemas can generate `File`/`Blob` references, and integer schemas can generate `zod.int()`, which breaks library typechecking.

**Why:** The API contract needs to compile in both browser and server packages, while the generated Zod package is not configured with DOM types and is pinned to a Zod 3-compatible runtime.

**How to apply:** Prefer portable JSON primitives such as Base64 strings and numeric timing fields for small MVP payloads. Revisit this only after upgrading or separating the server Zod/codegen configuration; use a dedicated multipart/realtime transport for large or streaming audio.