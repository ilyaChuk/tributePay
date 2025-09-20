# TributePay

## Setup

```bash
bun install
```

## Configuration

- `TRIBUTE_API_KEY` — Tribute webhook secret used to validate incoming requests.
- `PORT` (optional) — port for the Bun server, defaults to `3041`.

## Development

- Start the webhook listener:

  ```bash
  bun run index.ts
  ```

- Run the automated test suite:

  ```bash
  bun test
  ```

The server exposes the Tribute webhook at `/wh` and logs the payment identifier whenever a payment completion event is received.
