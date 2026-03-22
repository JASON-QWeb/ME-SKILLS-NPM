# TypeScript Rules

- Use `strict: true` in tsconfig. No exceptions.
- Prefer `interface` over `type` for object shapes that may be extended.
- Use `unknown` instead of `any`. If you must use `any`, add a `// eslint-disable` comment explaining why.
- Always handle Promise rejections. Use `try/catch` with async/await, never leave `.catch()` empty.
- Prefer `const` assertions for literal types: `as const`.
- Use discriminated unions over optional fields when modeling state.
- Avoid enums; use `const` objects with `as const` instead.
- Prefer `Record<string, T>` over `{ [key: string]: T }`.
- Name files in kebab-case: `user-service.ts`, not `UserService.ts`.
