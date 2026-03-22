# Security Rules

- Never hardcode secrets, API keys, or passwords. Use environment variables.
- Always validate and sanitize user input at system boundaries.
- Use parameterized queries for all database operations. Never concatenate SQL strings.
- Set `HttpOnly`, `Secure`, and `SameSite` flags on all cookies.
- Implement rate limiting on authentication endpoints.
- Use bcrypt or argon2 for password hashing. Never use MD5 or SHA for passwords.
- Always use HTTPS in production. Redirect HTTP to HTTPS.
- Apply the principle of least privilege: grant minimum permissions needed.
- Log security events (failed logins, permission denials) but never log sensitive data (passwords, tokens).
