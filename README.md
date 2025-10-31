# Money Lover MCP Server

Node.js implementation of a Model Context Protocol (MCP) server that wraps the unofficial Money Lover REST API. The server exposes authentication and wallet management capabilities as MCP tools, enabling AI assistants or compatible MCP clients to login, inspect wallets, query transactions, and create new transactions.

<a href="https://glama.ai/mcp/servers/@ferdhika31/moneylover-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@ferdhika31/moneylover-mcp/badge" alt="Money Lover Server MCP server" />
</a>

## Features

- Login tool returns Money Lover JWT tokens via the public OAuth flow.
- Tools for retrieving user info, wallets, categories, and transactions.
- Tool for adding new transactions, mirroring the behaviour of the Go reference client.
- Stdio-based server entrypoint that can be consumed by MCP-aware clients.
- Node-friendly REST wrapper for direct programmatic usage.

## Prerequisites

- Node.js 22 or newer.
- Money Lover account credentials for authentic API access.

## Installation

```bash
npm install
```

## Usage

Launch the MCP server over stdio (suitable for tools such as Claude Code, Cursor, or other MCP hosts):

```bash
npm start
```

### MCP Client Configuration

Configure an MCP-compliant client (for example, Claude desktop or Cursor) to invoke the published package via `npx` and supply credentials through environment variables:

```json
{
  "mcpServers": {
    "mcp-moneylover": {
      "command": "npx",
      "args": ["@ferdhika31/moneylover-mcp@latest"],
      "env": {
        "EMAIL": "alamat-email-anda@example.com",
        "PASSWORD": "kata-sandi-anda"
      }
    }
  }
}
```

The server automatically logs in with the provided credentials and refreshes the session token when required. Supplying a `token` argument to tools overrides the environment-based authentication.

Tokens resolved through the `login` tool or environment credentials are cached per-email under `~/.moneylover-mcp/`. Cached tokens are reused on subsequent runs and refreshed automatically when the API reports they have expired.

The server registers the following tools:

| Tool | Description | Required Arguments |
| --- | --- | --- |
| `login` | Retrieves a JWT token using email & password. | `email`, `password` |
| `get_user_info` | Returns profile information tied to the token. | `token` |
| `get_wallets` | Lists wallets available to the authenticated user. | `token` |
| `get_categories` | Lists categories for a wallet. | `token`, `walletId` |
| `get_transactions` | Retrieves transactions in a date range. | `token`, `walletId`, `startDate`, `endDate` |
| `add_transaction` | Creates a new transaction. | `token`, `walletId`, `categoryId`, `amount`, `date` (YYYY-MM-DD); optional `note`, `with` |

Tokens are not persisted; provide them explicitly when invoking tools other than `login`.

## Library Usage

The underlying REST wrapper is available for reuse:

```javascript
import { MoneyloverClient } from '@ferdhika31/moneylover-mcp';

const token = await MoneyloverClient.getToken(email, password);
const client = new MoneyloverClient(token);
const wallets = await client.getWallets();
```

## Testing

Run the automated test suite:

```bash
npm test
```

Tests rely on mocked fetch responses and do not hit the live Money Lover service.

## Security Notes

- Never commit real credentials or tokens.
- The project intentionally avoids persisting tokens; MCP clients should store secrets securely on their side.
- Cached tokens are stored locally with file permissions restricted to the current user. Delete the `~/.moneylover-mcp/` directory if you need to revoke stored sessions.