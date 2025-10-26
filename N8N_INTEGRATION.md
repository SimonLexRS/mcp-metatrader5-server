# n8n Integration Guide for MetaTrader 5 MCP Server

This guide explains how to integrate the MT5 MCP Server with n8n for workflow automation and trading operations.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [n8n Configuration](#n8n-configuration)
- [Available Endpoints](#available-endpoints)
- [Example Workflows](#example-workflows)
- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

The MT5 MCP Server provides HTTP endpoints compatible with n8n's HTTP Request node, including:

- **Standard REST API** for simple tool calls
- **Streaming NDJSON API** for long-running operations (compatible with n8n's HTTP Request Streamable)
- **44+ trading tools** for market data, trading, and account management

### Architecture

```
┌─────────┐      HTTP/HTTPS      ┌──────────────┐      Python      ┌─────────┐
│   n8n   │ ───────────────────> │  Node.js     │ ──────────────> │  MCP    │
│ Workflow│      REST/Stream      │  HTTP Server │    Bridge       │ Python  │
└─────────┘                       └──────────────┘                 └─────────┘
                                                                         │
                                                                         v
                                                                   ┌──────────┐
                                                                   │ MT5      │
                                                                   │ Terminal │
                                                                   └──────────┘
```

---

## Prerequisites

### 1. Deployed MT5 MCP Server

- Server must be accessible via HTTP/HTTPS
- `AUTH_TOKEN` must be configured
- Health endpoint should be accessible

**Verify deployment**:
```bash
curl http://your-server:8080/health
```

### 2. n8n Instance

- n8n Cloud, self-hosted, or Desktop
- Version 0.200.0+ recommended
- Network access to MT5 MCP Server

### 3. Credentials

- MT5 MCP Server URL (e.g., `http://your-domain:8080`)
- `AUTH_TOKEN` value

---

## n8n Configuration

### Method 1: Using HTTP Request Node (Standard)

For simple, non-streaming tool calls:

1. **Add HTTP Request Node** to your workflow

2. **Configure Authentication**:
   - Click on the HTTP Request node
   - Scroll to **Authentication** section
   - Select: **"Generic Credential Type"** → **"Header Auth"**
   - Create new credential:
     - **Name**: `MT5-MCP-Auth`
     - **Header Name**: `Auth`
     - **Header Value**: `<your-AUTH_TOKEN>`

3. **Configure Request**:
   - **Method**: `POST`
   - **URL**: `http://your-server:8080/v1/tools/<tool-name>`
   - **Body Content Type**: `JSON`
   - **Body**:
     ```json
     {
       "params": {
         "param1": "value1",
         "param2": "value2"
       }
     }
     ```

4. **Response Handling**:
   - Response format:
     ```json
     {
       "ok": true,
       "result": { /* tool-specific data */ }
     }
     ```

### Method 2: Using HTTP Request Node (Streaming)

For long-running operations or large data fetches:

1. **Add HTTP Request Node** to your workflow

2. **Configure Authentication** (same as Method 1)

3. **Configure Request**:
   - **Method**: `POST`
   - **URL**: `http://your-server:8080/v1/tools/<tool-name>/stream`
   - **Body Content Type**: `JSON`
   - **Body**: Same as standard method
   - **Response Format**: `ndjson` (if available) or `text`

4. **Response Handling**:
   - Each line is a separate JSON object
   - Events: `start`, `result`, `end`, `error`
   - Example stream:
     ```json
     {"event":"start","tool":"get_symbols","timestamp":"2025-10-26T12:00:00.000Z"}
     {"event":"result","data":[...]}
     {"event":"end"}
     ```

5. **Parse NDJSON** (if needed):
   - Add **Code Node** after HTTP Request
   - JavaScript to parse:
     ```javascript
     const lines = $input.all()[0].json.body.split('\n').filter(l => l.trim());
     const events = lines.map(line => JSON.parse(line));
     const resultEvent = events.find(e => e.event === 'result');
     return [{ json: resultEvent.data }];
     ```

---

## Available Endpoints

### Base URL Structure

```
http://your-server:8080/v1/tools/<tool-name>[/stream]
```

### Endpoint Types

| Endpoint Pattern | Response Type | Use Case |
|-----------------|---------------|----------|
| `/v1/tools/<tool>` | JSON | Single-response operations |
| `/v1/tools/<tool>/stream` | NDJSON Stream | Large data fetches, long operations |
| `/health` | JSON | Health check (no auth) |

### Common Tools

#### Connection & Account
- `initialize` - Initialize MT5 terminal
- `login` - Log in to trading account
- `get_account_info` - Get account details
- `get_version` - Get MT5 version

#### Market Data
- `get_symbols` - List all symbols
- `get_symbol_info` - Symbol details
- `get_symbol_info_tick` - Latest tick data
- `copy_rates_from_pos` - Historical bars
- `copy_ticks_from_pos` - Historical ticks

#### Trading
- `order_send` - Place order
- `order_check` - Validate order
- `positions_get` - Get open positions
- `orders_get` - Get active orders

#### History
- `history_orders_get` - Historical orders
- `history_deals_get` - Historical deals

---

## Example Workflows

### Workflow 1: Market Data Analysis

**Goal**: Fetch EURUSD hourly data and analyze trends

**Workflow**:

1. **HTTP Request Node** - Get Symbols
   ```
   POST http://your-server:8080/v1/tools/get_symbols
   Auth: <token>
   Body: {"params": {}}
   ```

2. **Filter Node** - Find EURUSD
   ```javascript
   {{ $json.result.find(s => s.name === 'EURUSD') }}
   ```

3. **HTTP Request Node** - Get Rates
   ```
   POST http://your-server:8080/v1/tools/copy_rates_from_pos
   Auth: <token>
   Body: {
     "params": {
       "symbol": "EURUSD",
       "timeframe": "H1",
       "start_pos": 0,
       "count": 100
     }
   }
   ```

4. **Code Node** - Calculate Moving Average
   ```javascript
   const rates = $json.result;
   const closes = rates.map(r => r.close);
   const ma20 = closes.slice(0, 20).reduce((a,b) => a+b) / 20;
   return [{ json: { symbol: 'EURUSD', ma20, current: closes[0] } }];
   ```

5. **IF Node** - Check Crossover
   ```javascript
   {{ $json.current > $json.ma20 }}
   ```

6. **Slack/Email Node** - Send Alert

### Workflow 2: Automated Trading

**Goal**: Place a buy order when conditions are met

**Workflow**:

1. **Schedule Trigger** - Every 5 minutes

2. **HTTP Request Node** - Get Account Info
   ```
   POST http://your-server:8080/v1/tools/get_account_info
   Auth: <token>
   Body: {"params": {}}
   ```

3. **IF Node** - Check Balance
   ```javascript
   {{ $json.result.balance > 1000 }}
   ```

4. **HTTP Request Node** - Get Current Tick
   ```
   POST http://your-server:8080/v1/tools/get_symbol_info_tick
   Auth: <token>
   Body: {"params": {"symbol": "EURUSD"}}
   ```

5. **HTTP Request Node** - Place Order
   ```
   POST http://your-server:8080/v1/tools/order_send
   Auth: <token>
   Body: {
     "params": {
       "request": {
         "action": 1,
         "symbol": "EURUSD",
         "volume": 0.1,
         "type": 0,
         "price": "{{ $json.result.ask }}",
         "deviation": 20,
         "magic": 123456,
         "comment": "n8n automated trade",
         "type_time": 0,
         "type_filling": 1
       }
     }
   }
   ```

6. **HTTP Request Node** - Get Positions
   ```
   POST http://your-server:8080/v1/tools/positions_get
   Auth: <token>
   Body: {"params": {}}
   ```

7. **Slack Node** - Send Confirmation

### Workflow 3: Position Monitoring

**Goal**: Monitor open positions and close on profit target

**Workflow**:

1. **Schedule Trigger** - Every 1 minute

2. **HTTP Request Node (Stream)** - Get All Positions
   ```
   POST http://your-server:8080/v1/tools/positions_get/stream
   Auth: <token>
   Body: {"params": {}}
   ```

3. **Code Node** - Parse Stream and Check Profit
   ```javascript
   const lines = $input.all()[0].json.body.split('\n').filter(l => l.trim());
   const events = lines.map(line => JSON.parse(line));
   const resultEvent = events.find(e => e.event === 'result');
   const positions = resultEvent.data;

   const profitablePositions = positions.filter(p => p.profit > 10);
   return profitablePositions.map(p => ({ json: p }));
   ```

4. **HTTP Request Node** - Close Position
   ```
   POST http://your-server:8080/v1/tools/order_send
   Auth: <token>
   Body: {
     "params": {
       "request": {
         "action": 1,
         "position": "{{ $json.ticket }}",
         "type": 1,
         "volume": "{{ $json.volume }}",
         "price": "{{ $json.price_current }}",
         "deviation": 20
       }
     }
   }
   ```

5. **Database Node** - Log Closed Trade

---

## Authentication

### Setting Up Header Auth

1. **In n8n Credentials Manager**:
   - Go to **Credentials** (left sidebar)
   - Click **Add Credential**
   - Search for **"Header Auth"**

2. **Configure**:
   - **Credential Name**: `MT5-MCP-Server`
   - **Auth Type**: `Header Auth`
   - **Header Name**: `Auth` (case-sensitive)
   - **Header Value**: Your `AUTH_TOKEN` value

3. **Test Connection**:
   - Create test workflow
   - Add HTTP Request node
   - URL: `http://your-server:8080/health`
   - Select your credential
   - Execute node
   - Expected response: `{"status": "ok", ...}`

### Security Considerations

- Store `AUTH_TOKEN` as an n8n credential (never hardcode)
- Use HTTPS in production (enable SSL in Dokploy)
- Rotate tokens regularly
- Use different tokens for dev/staging/production
- Enable IP whitelisting if possible

---

## Error Handling

### Standard Error Response

```json
{
  "ok": false,
  "error": "Error message here",
  "details": { /* optional additional info */ }
}
```

### Common HTTP Status Codes

| Code | Meaning | Solution |
|------|---------|----------|
| 200 | Success | Process result |
| 400 | Bad Request | Check parameters |
| 401 | Unauthorized | Verify AUTH_TOKEN |
| 404 | Not Found | Check tool name |
| 502 | Bad Gateway | MT5 connection failed |

### n8n Error Handling

Add **Error Trigger Node** to your workflow:

```javascript
// In Error Trigger node
const error = $json;
const errorMessage = error.message || 'Unknown error';

// Log to external service or database
return [{
  json: {
    timestamp: new Date().toISOString(),
    workflow: $workflow.name,
    node: error.node,
    error: errorMessage
  }
}];
```

---

## Best Practices

### 1. Rate Limiting

- Don't hammer the API (MT5 has rate limits)
- Use reasonable intervals: 1-5 minutes for monitoring
- Implement exponential backoff on errors

### 2. Error Recovery

```javascript
// In Code Node - Retry Logic
let retries = 3;
let result = null;

for (let i = 0; i < retries; i++) {
  try {
    result = await $http.request({
      method: 'POST',
      url: 'http://your-server:8080/v1/tools/get_account_info',
      headers: { 'Auth': '<token>' },
      body: { params: {} }
    });
    break;
  } catch (error) {
    if (i === retries - 1) throw error;
    await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
  }
}

return [{ json: result }];
```

### 3. Data Validation

Always validate responses before using:

```javascript
// In Code Node
const response = $json;

if (!response.ok) {
  throw new Error(`API Error: ${response.error}`);
}

if (!response.result) {
  throw new Error('No result in response');
}

return [{ json: response.result }];
```

### 4. Streaming for Large Data

Use streaming endpoints for:
- Fetching many symbols (100+)
- Historical data (1000+ bars)
- Multiple positions/orders

### 5. Logging and Monitoring

- Log all trade executions
- Monitor API response times
- Track error rates
- Set up alerts for failures

---

## Troubleshooting

### Issue: 401 Unauthorized

**Cause**: Missing or incorrect AUTH_TOKEN

**Solution**:
1. Verify credential is selected in HTTP Request node
2. Check token value matches server configuration
3. Ensure header name is `Auth` (not `Authorization`)

### Issue: Timeout Errors

**Cause**: MT5 operation taking too long

**Solution**:
1. Increase n8n timeout setting
2. Use streaming endpoint instead
3. Reduce data fetch size (smaller count parameter)

### Issue: Connection Refused

**Cause**: Server not accessible

**Solution**:
1. Check server is running: `curl http://your-server:8080/health`
2. Verify firewall rules
3. Check network connectivity from n8n to server
4. Ensure correct port (8080)

### Issue: Invalid JSON in Body

**Cause**: Malformed request body

**Solution**:
1. Validate JSON syntax
2. Ensure all parameters are in `params` object
3. Check for unescaped quotes or special characters

### Issue: MT5 Errors in Response

**Cause**: MT5 terminal or account issues

**Solution**:
1. Check MT5 credentials are correct
2. Verify MT5 terminal is running
3. Check account has trading permissions
4. Review MT5 error codes in response details

---

## Advanced Topics

### Webhooks Integration

Use n8n webhooks to trigger workflows from external systems:

1. **Add Webhook Trigger** node
2. Configure:
   - Method: `POST`
   - Path: `/mt5-webhook`
   - Authentication: Basic Auth

3. **Process webhook data** and call MT5 tools

4. **Return response** to webhook caller

### Multi-Account Management

Manage multiple MT5 accounts:

1. Deploy multiple MT5 MCP Server instances (one per account)
2. Create separate credentials in n8n for each
3. Use Switch node to route requests based on account

### Real-Time Alerts

Set up Telegram/Slack alerts:

1. Monitor positions every minute
2. Calculate P&L
3. Send alert when profit/loss threshold hit
4. Include position details and action recommendations

---

## Example Code Snippets

### Check Server Health

```javascript
// Code Node - Health Check
const response = await $http.request({
  method: 'GET',
  url: 'http://your-server:8080/health',
  returnFullResponse: true
});

return [{
  json: {
    healthy: response.statusCode === 200,
    uptime: response.body.uptimeSeconds,
    timestamp: new Date().toISOString()
  }
}];
```

### Parse Streaming Response

```javascript
// Code Node - Parse NDJSON Stream
const body = $json.body;
const lines = body.split('\n').filter(line => line.trim());

const events = lines.map(line => {
  try {
    return JSON.parse(line);
  } catch (e) {
    return null;
  }
}).filter(e => e !== null);

const startEvent = events.find(e => e.event === 'start');
const resultEvent = events.find(e => e.event === 'result');
const endEvent = events.find(e => e.event === 'end');
const errorEvent = events.find(e => e.event === 'error');

if (errorEvent) {
  throw new Error(errorEvent.message);
}

return [{
  json: {
    tool: startEvent?.tool,
    data: resultEvent?.data,
    completed: !!endEvent
  }
}];
```

### Calculate Position Statistics

```javascript
// Code Node - Position Analysis
const positions = $json.result;

const stats = {
  total: positions.length,
  profitable: positions.filter(p => p.profit > 0).length,
  losing: positions.filter(p => p.profit < 0).length,
  totalProfit: positions.reduce((sum, p) => sum + p.profit, 0),
  avgProfit: positions.length > 0
    ? positions.reduce((sum, p) => sum + p.profit, 0) / positions.length
    : 0,
  symbols: [...new Set(positions.map(p => p.symbol))]
};

return [{ json: stats }];
```

---

## Resources

- **n8n Documentation**: https://docs.n8n.io
- **MT5 MCP Server API Reference**: See [API_REFERENCE.md](docs/api_reference.md)
- **MCP Protocol**: https://modelcontextprotocol.io
- **n8n Community**: https://community.n8n.io

---

## Support

For issues or questions:
- **GitHub Issues**: https://github.com/Qoyyuum/mcp-metatrader5-server/issues
- **Documentation**: https://mcp-metatrader5-server.readthedocs.io

---

## License

MIT License - See [LICENSE](LICENSE) file for details.
