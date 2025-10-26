# Hybrid Deployment Guide: Linux + Windows Architecture

This guide explains how to deploy the MT5 MCP Server in a **hybrid architecture** where:
- The **HTTP Server** runs on **Linux** (Dokploy, Docker, VPS)
- The **MT5 Terminal** runs on **Windows** (local machine, VPS, cloud instance)

## Architecture Overview

```
┌─────────────────┐      HTTP/HTTPS      ┌────────────────────┐      HTTP      ┌──────────────┐
│                 │────────────────────> │                    │───────────────>│   Windows    │
│   n8n / Client  │                       │  Linux Dokploy     │                │   Bridge     │
│                 │<────────────────────  │  (Node.js Server)  │<───────────────│   Server     │
└─────────────────┘                       └────────────────────┘                └──────────────┘
                                                                                        │
                                                                                        v
                                                                                 ┌─────────────┐
                                                                                 │ MT5         │
                                                                                 │ Terminal    │
                                                                                 └─────────────┘

Components:
1. Linux Server (Dokploy): Node.js HTTP API server
2. Windows Machine: MT5 Bridge Server + MT5 Terminal
3. Client: n8n or any HTTP client

Communication:
- Client → Linux: HTTPS/HTTP (port 8080)
- Linux → Windows: HTTP (port 5555)
- Windows Bridge → MT5: Local API calls
```

## Why Hybrid Architecture?

### Problem
- **MetaTrader 5** only runs on Windows
- **Dokploy** typically runs on Linux servers
- Cannot run Windows containers on Linux host

### Solution
- Deploy the **HTTP API server** on Linux (Dokploy)
- Run a **bridge server** on a Windows machine
- Linux server communicates with Windows bridge via HTTP

### Benefits
- ✅ Deploy on any Linux server (Dokploy, VPS, cloud)
- ✅ Keep MT5 on Windows where it runs natively
- ✅ Scale HTTP server independently
- ✅ Secure MT5 Windows machine behind firewall
- ✅ Use existing Windows infrastructure

---

## Part 1: Linux Server Setup (Dokploy)

### Step 1: Deploy to Dokploy

1. **Create New Application** in Dokploy
   - Name: `mt5-mcp-server`
   - Type: Dockerfile
   - Repository: Your Git repository
   - Branch: `claude/prepare-dokploy-deployment-011CUWEh7TdqbGtphx6tYTV4`

2. **Configure Dockerfile**
   - Use `Dockerfile.linux` instead of default `Dockerfile`
   - In Dokploy build settings, set dockerfile path: `Dockerfile.linux`

3. **Set Environment Variables** in Dokploy UI:

```bash
# Node.js Server
NODE_PORT=8080
NODE_ENV=production
AUTH_TOKEN=<generate-with-openssl-rand-base64-32>

# Remote Bridge Configuration
MT5_BRIDGE_URL=http://YOUR_WINDOWS_IP:5555
MT5_BRIDGE_TOKEN=<same-as-windows-bridge-auth-token>

# Optional: If bridge token is different from API token
# MT5_BRIDGE_TOKEN=different-token-for-bridge
```

4. **Configure Port Mapping**
   - Container Port: `8080`
   - Published Port: `8080` (or your preference)

5. **Deploy**
   - Click "Deploy" button
   - Wait for build to complete
   - Check logs for "Server running at..."

### Step 2: Verify Linux Deployment

```bash
# Health check (should return ok even without Windows bridge)
curl http://your-dokploy-server:8080/health

# Detailed health check (will show bridge connection status)
curl http://your-dokploy-server:8080/health/detailed
```

Expected response when bridge is not yet connected:
```json
{
  "status": "degraded",
  "healthy": false,
  "bridgeMode": "remote",
  "bridgeUrl": "http://YOUR_WINDOWS_IP:5555",
  "mt5": {
    "available": false,
    "error": "Failed to connect: ECONNREFUSED"
  }
}
```

---

## Part 2: Windows Bridge Server Setup

### Step 1: Prepare Windows Machine

**Requirements:**
- Windows 10/11 or Windows Server
- MetaTrader 5 installed
- Python 3.11+ installed
- Network connectivity to Linux server

**Security Considerations:**
- This machine will expose MT5 via HTTP
- Use strong authentication token
- Configure firewall rules
- Consider VPN or private network
- Use HTTPS in production (add reverse proxy)

### Step 2: Install Windows Bridge Server

```powershell
# 1. Clone repository (or copy windows-bridge folder)
git clone https://github.com/SimonLexRS/mcp-metatrader5-server.git
cd mcp-metatrader5-server/windows-bridge

# 2. Create virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
copy .env.example .env
# Edit .env with your settings (see below)
```

### Step 3: Configure Windows Bridge

Edit `windows-bridge/.env`:

```env
# Bridge Server Configuration
MT5_BRIDGE_HOST=0.0.0.0          # Listen on all interfaces
MT5_BRIDGE_PORT=5555              # Port for bridge server

# Authentication - MUST match Linux server's MT5_BRIDGE_TOKEN
AUTH_TOKEN=<same-token-as-linux-server>

# MetaTrader 5 Configuration
MT5_PATH=C:\Program Files\MetaTrader 5\terminal64.exe
MT5_LOGIN=123456
MT5_PASSWORD=your_mt5_password
MT5_SERVER=YourBroker-Demo

# Auto-connect on startup
MT5_AUTO_CONNECT=true
```

**Security Note:**
- Generate `AUTH_TOKEN` with: `openssl rand -base64 32` (on Linux) or use PowerShell:
  ```powershell
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RNGCryptoServiceProvider]::Create().GetBytes($bytes)
  [Convert]::ToBase64String($bytes)
  ```

### Step 4: Configure Windows Firewall

```powershell
# Allow inbound traffic on port 5555
New-NetFirewallRule -DisplayName "MT5 Bridge Server" `
  -Direction Inbound `
  -LocalPort 5555 `
  -Protocol TCP `
  -Action Allow
```

Or manually:
1. Open Windows Defender Firewall
2. Advanced Settings → Inbound Rules → New Rule
3. Port → TCP → Specific local ports: 5555
4. Allow the connection
5. Apply to all profiles (Domain, Private, Public) - adjust based on your network

### Step 5: Start Windows Bridge Server

```powershell
# From windows-bridge directory
python mt5-bridge-server.py
```

Expected output:
```
======================================================================
MetaTrader 5 Bridge Server
======================================================================
Host: 0.0.0.0:5555
Auto-connect: True
Auth required: True
MT5 Path: C:\Program Files\MetaTrader 5\terminal64.exe
======================================================================
Initializing MT5 connection...
✓ MT5 connected successfully
  Version: (5, 0, 5370)
  Terminal: MetaTrader 5
  Company: MetaQuotes Ltd.

Server running at http://0.0.0.0:5555
Press Ctrl+C to stop
```

### Step 6: Test Windows Bridge

```powershell
# From another terminal or machine
curl http://localhost:5555/health

# With authentication
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5555/status
```

### Step 7: Run as Windows Service (Production)

For production, run the bridge as a Windows Service:

**Option A: Using NSSM (Non-Sucking Service Manager)**

```powershell
# Download NSSM from https://nssm.cc/download
# Extract and run as administrator

nssm install MT5BridgeServer "C:\path\to\python.exe" "C:\path\to\mt5-bridge-server.py"
nssm set MT5BridgeServer AppDirectory "C:\path\to\windows-bridge"
nssm set MT5BridgeServer DisplayName "MT5 Bridge Server"
nssm set MT5BridgeServer Description "MetaTrader 5 Bridge Server for MCP"
nssm set MT5BridgeServer Start SERVICE_AUTO_START
nssm start MT5BridgeServer
```

**Option B: Using Task Scheduler**

1. Open Task Scheduler
2. Create Basic Task
3. Name: "MT5 Bridge Server"
4. Trigger: At startup
5. Action: Start a program
   - Program: `C:\path\to\python.exe`
   - Arguments: `C:\path\to\mt5-bridge-server.py`
   - Start in: `C:\path\to\windows-bridge`
6. Enable "Run with highest privileges"
7. Run whether user is logged on or not

---

## Part 3: Connect Linux to Windows

### Step 1: Update Linux Environment Variables

In Dokploy, update environment variables:

```bash
# Windows Bridge URL
MT5_BRIDGE_URL=http://WINDOWS_IP_ADDRESS:5555

# Bridge authentication token (must match Windows)
MT5_BRIDGE_TOKEN=your-secure-token
```

Replace `WINDOWS_IP_ADDRESS` with:
- **Local network**: Windows machine's private IP (e.g., `192.168.1.100`)
- **Cloud/VPS**: Windows machine's public IP or domain
- **VPN**: VPN IP address

### Step 2: Restart Linux Service

In Dokploy:
1. Redeploy the application to apply new environment variables
2. Or restart the container manually

### Step 3: Verify Connection

```bash
# From any client
curl http://your-dokploy-server:8080/health/detailed
```

Expected response (success):
```json
{
  "status": "ok",
  "healthy": true,
  "bridgeMode": "remote",
  "bridgeUrl": "http://192.168.1.100:5555",
  "mt5": {
    "available": true,
    "version": [5, 0, 5370]
  }
}
```

---

## Part 4: Test End-to-End

### Test 1: Get MT5 Version

```bash
curl -X POST http://your-dokploy-server:8080/v1/tools/get_version \
  -H "Auth: YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"params": {}}'
```

Expected response:
```json
{
  "ok": true,
  "result": [5, 0, 5370]
}
```

### Test 2: Get Account Info

```bash
curl -X POST http://your-dokploy-server:8080/v1/tools/get_account_info \
  -H "Auth: YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"params": {}}'
```

### Test 3: Get Symbols

```bash
curl -X POST http://your-dokploy-server:8080/v1/tools/get_symbols \
  -H "Auth: YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"params": {}}'
```

---

## Network Configuration

### Option 1: Same Local Network

**Setup:**
- Linux server and Windows machine on same LAN
- Use private IP address

**Configuration:**
```bash
MT5_BRIDGE_URL=http://192.168.1.100:5555
```

**Pros:**
- Fast, low latency
- No internet exposure
- No bandwidth costs

**Cons:**
- Only works on same network
- Requires static IP or DNS

### Option 2: Cloud/VPS to Cloud/VPS

**Setup:**
- Both machines on internet
- Windows machine has public IP

**Configuration:**
```bash
MT5_BRIDGE_URL=http://WINDOWS_PUBLIC_IP:5555
```

**Security:**
- Use firewall to restrict access (allow only Linux server IP)
- Use VPN tunnel
- Use HTTPS (add reverse proxy on Windows)

### Option 3: VPN Connection

**Setup:**
- Both machines connected via VPN (WireGuard, OpenVPN, Tailscale)
- Use VPN IP addresses

**Configuration:**
```bash
MT5_BRIDGE_URL=http://10.0.0.5:5555  # VPN IP
```

**Pros:**
- Encrypted tunnel
- No public exposure
- Works across networks

**Cons:**
- Requires VPN setup
- Additional complexity

### Option 4: SSH Tunnel (Development)

**Setup:**
- Use SSH tunnel for temporary connection

```bash
# On Linux server
ssh -L 5555:localhost:5555 user@windows-machine

# Configure
MT5_BRIDGE_URL=http://localhost:5555
```

---

## Security Considerations

### 1. Authentication

- ✅ Use strong tokens (32+ characters, random)
- ✅ Different tokens for API and bridge
- ✅ Rotate tokens regularly
- ✅ Store in environment variables, not code

### 2. Network Security

- ✅ Use private network or VPN
- ✅ Configure firewall rules
- ✅ Restrict bridge access by IP
- ✅ Use HTTPS in production

### 3. Windows Bridge Security

```powershell
# Restrict to specific IP (Linux server)
New-NetFirewallRule -DisplayName "MT5 Bridge - Linux Only" `
  -Direction Inbound `
  -LocalPort 5555 `
  -Protocol TCP `
  -RemoteAddress "LINUX_SERVER_IP" `
  -Action Allow
```

### 4. HTTPS/TLS (Recommended for Production)

Add nginx reverse proxy on Windows:

```nginx
server {
    listen 443 ssl;
    server_name mt5-bridge.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:5555;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Then use:
```bash
MT5_BRIDGE_URL=https://mt5-bridge.yourdomain.com
```

---

## Troubleshooting

### Issue: Linux server cannot connect to Windows bridge

**Symptoms:**
```json
{
  "mt5": {
    "available": false,
    "error": "Failed to connect: ECONNREFUSED"
  }
}
```

**Solutions:**
1. Check Windows bridge is running: `netstat -an | findstr 5555`
2. Verify firewall allows port 5555
3. Test from Linux: `curl http://WINDOWS_IP:5555/health`
4. Check network connectivity: `ping WINDOWS_IP`
5. Verify MT5_BRIDGE_URL is correct in Linux environment

### Issue: Authentication failed

**Symptoms:**
```json
{
  "error": "Unauthorized: Invalid MT5 bridge token"
}
```

**Solutions:**
1. Verify AUTH_TOKEN matches on both machines
2. Check no extra spaces or newlines in tokens
3. Restart both servers after changing tokens

### Issue: MT5 connection failed on Windows

**Symptoms:**
```
✗ Failed to connect to MT5: ...
```

**Solutions:**
1. Verify MT5 terminal is installed at MT5_PATH
2. Check MT5 credentials are correct
3. Test MT5 login manually in terminal
4. Ensure MT5_SERVER name is exact (case-sensitive)
5. Check MT5 terminal is allowed in Windows firewall

### Issue: Slow response times

**Solutions:**
1. Check network latency: `ping WINDOWS_IP`
2. Verify Windows machine has sufficient resources
3. Check MT5 terminal is not overloaded
4. Consider moving Windows closer to Linux (same datacenter)
5. Use VPN with optimized routing

---

## Monitoring and Maintenance

### Health Check Automation

```bash
#!/bin/bash
# health-check.sh

DOKPLOY_URL="http://your-dokploy-server:8080"
AUTH_TOKEN="your-token"

# Check detailed health
response=$(curl -s "$DOKPLOY_URL/health/detailed")
healthy=$(echo "$response" | jq -r '.healthy')

if [ "$healthy" != "true" ]; then
  echo "ALERT: MT5 MCP Server unhealthy"
  echo "$response"
  # Send alert (email, Slack, etc.)
fi
```

Run with cron every 5 minutes:
```bash
*/5 * * * * /path/to/health-check.sh
```

### Logging

**Linux server logs:**
```bash
# In Dokploy
docker logs -f container-id
```

**Windows bridge logs:**
- Stdout/stderr printed to console
- Redirect to file:
  ```powershell
  python mt5-bridge-server.py >> bridge.log 2>&1
  ```

### Performance Monitoring

Monitor:
- Response times of /health/detailed
- Network latency between Linux and Windows
- Windows CPU/memory usage
- MT5 terminal resource usage

---

## Cost Analysis

### Option A: All Cloud

- Linux VPS (Dokploy): $5-20/month
- Windows VPS (MT5): $15-40/month
- **Total: $20-60/month**

### Option B: Hybrid (Home Windows + Cloud Linux)

- Linux VPS (Dokploy): $5-20/month
- Windows machine at home: $0 (existing machine)
- **Total: $5-20/month**

### Option C: All Local

- Both on local network: $0
- Only for development/testing

---

## Production Checklist

- [ ] Windows bridge running as Windows Service
- [ ] Strong authentication tokens configured
- [ ] Firewall rules configured on Windows
- [ ] Network connectivity tested
- [ ] HTTPS/TLS enabled (reverse proxy)
- [ ] Health checks automated
- [ ] Monitoring and alerts set up
- [ ] Backups of configuration files
- [ ] Documentation of IP addresses and credentials
- [ ] Testing of all 44+ tools
- [ ] n8n workflows tested end-to-end

---

## Alternative: All Windows Deployment

If you have access to a Windows-capable Dokploy host, you can use the original `Dockerfile` (Windows-based) and skip the hybrid architecture. However, Windows containers are less common and typically more expensive.

---

## Support

- **GitHub Issues**: https://github.com/Qoyyuum/mcp-metatrader5-server/issues
- **Documentation**: See [DEPLOYMENT.md](DEPLOYMENT.md) and [N8N_INTEGRATION.md](N8N_INTEGRATION.md)

---

## License

MIT License - See [LICENSE](LICENSE) file for details.
