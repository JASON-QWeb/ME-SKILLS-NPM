# React Rules

- Use functional components only. No class components.
- Keep components under 150 lines. Extract sub-components when they grow.
- Colocate state with the component that uses it. Lift state only when necessary.
- Use `useMemo` and `useCallback` only when there's a measured performance problem, not preemptively.
- Prefer server components by default in Next.js. Add `"use client"` only when you need interactivity.
- Never fetch data in `useEffect`. Use the framework's data fetching (loader, server component, React Query).
- Name event handlers with `handle` prefix: `handleClick`, `handleSubmit`.
- Name boolean props with `is`/`has` prefix: `isLoading`, `hasError`.
- Always provide a `key` prop when rendering lists. Never use array index as key unless the list is static.
