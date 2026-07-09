# Security Policy

## Supported versions

Security fixes are applied to the default branch.

## Reporting a vulnerability

Please **do not** open a public issue for security-sensitive reports.

Instead, open a [GitHub private vulnerability report](https://github.com/dujavi/tooned/security/advisories/new) or contact the maintainer directly.

Include:

- Description of the issue
- Steps to reproduce
- Impact assessment

## Credential handling

- Never commit `.env`, API tokens, or Jira/Bitbucket/GitHub credentials.
- `tooned.yaml` may contain instance-specific metadata — treat local copies as sensitive if they reveal internal infrastructure.
- The CLI reads secrets from environment variables; keep `.env` out of version control.

## Scope notes

Tooned runs locally and calls third-party APIs with user-supplied credentials. Vulnerabilities in dependency parsing, SQL handling, or HTTP exposure of the local service are in scope.
