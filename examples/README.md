# Example presets

Copy a preset and point Tooned at it:

```bash
export TOONED_CONFIG_PATH=examples/sample-preset/tooned.yaml
pnpm exec tooned doctor
```

Or merge values into your local `tooned.yaml` (gitignored).

Presets should use **sanitized** project keys and field IDs. Replace IDs with values from your Jira instance before use.
