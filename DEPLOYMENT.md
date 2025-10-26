# Deployment Guide for MetaTrader 5 MCP Server

This guide covers deploying the MT5 MCP Server on various platforms, with a focus on Dokploy deployment.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Dokploy Deployment](#dokploy-deployment)
- [Docker Deployment](#docker-deployment)
- [Manual Deployment](#manual-deployment)
- [Environment Configuration](#environment-configuration)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **Operating System**: Windows Server 2019/2022 or Windows 10/11 Pro
  - MetaTrader 5 terminal only runs on Windows
  - Linux/macOS deployment not supported due to MT5 limitations

- **Resources**:
  - CPU: 2+ cores recommended
  - RAM: 4GB minimum, 8GB recommended
  - Storage: 10GB+ available space

### Required Software

1. **MetaTrader 5 Terminal**
   - Download from: https://www.metatrader5.com/
   - Install to default location or note custom path
   - Obtain trading account credentials (demo or real)

2. **Docker (for containerized deployment)**
   - Docker Desktop for Windows
   - Windows Container support enabled

3. **Trading Account**
   - MT5 broker account (demo or live)
   - Account number (login)
   - Password
   - Server name (e.g., "ICMarkets-Demo")

---

## Dokploy Deployment

Dokploy is a self-hosted platform for deploying applications with ease. This section guides you through deploying the MT5 MCP Server on Dokploy.

### Step 1: Prepare Your Dokploy Instance

1. Ensure your Dokploy instance is running on a Windows host
2. Verify Docker Windows containers are supported
3. Log in to your Dokploy dashboard

### Step 2: Create a New Application

1. In Dokploy dashboard, click **"New Application"**
2. Choose **"Docker Compose"** or **"Dockerfile"** deployment type
3. Configure the application:
   - **Name**: `mt5-mcp-server`
   - **Repository**: Your Git repository URL
   - **Branch**: `main` or your deployment branch

### Step 3: Configure Environment Variables

In Dokploy UI, navigate to **Environment Variables** and add:

```bash
# Required Variables
AUTH_TOKEN=<generate-strong-random-token>
MT5_PATH=C:\Program Files\MetaTrader 5\terminal64.exe
MT5_LOGIN=<your-mt5-account-number>
MT5_PASSWORD=<your-mt5-password>
MT5_SERVER=<your-broker-server-name>

# Optional Variables
NODE_PORT=8080
NODE_ENV=production
MT5_AUTO_CONNECT=true
PYTHON_EXECUTABLE=python
```

**Security Notes**:
- Generate `AUTH_TOKEN` using: `openssl rand -base64 32`
- Use Dokploy's **Secrets** feature for sensitive values
- Never commit credentials to Git

### Step 4: Configure Port Mapping

In Dokploy's **Port Configuration**:
- Container Port: `8080`
- Published Port: `8080` (or your preferred external port)
- Protocol: `TCP`

### Step 5: Set Health Check

Configure health check in Dokploy:
- **Type**: HTTP
- **Path**: `/health`
- **Port**: `8080`
- **Interval**: 30 seconds
- **Timeout**: 10 seconds
- **Retries**: 3

### Step 6: Configure Domain (Optional)

If you want to expose the service via a domain:
1. Go to **Domains** section
2. Add your domain: `mt5-mcp.yourdomain.com`
3. Enable SSL/TLS (Let's Encrypt)
4. Save configuration

### Step 7: Deploy

1. Click **"Deploy"** button
2. Monitor deployment logs
3. Wait for health check to pass (may take 40-60 seconds on first start)
4. Verify deployment at `http://your-domain:8080/health`

### Step 8: Verify Deployment

Test the deployment:

```bash
# Health check
curl http://your-domain:8080/health

# Test with authentication (if AUTH_TOKEN is set)
curl -X POST http://your-domain:8080/v1/tools/get_version \
  -H "Auth: YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"params": {}}'
```

Expected health response:
```json
{
  "status": "ok",
  "requireAuth": true,
  "uptimeSeconds": 120,
  "timestamp": "2025-10-26T12:00:00.000Z"
}
```

---

## Docker Deployment

### Using Docker Compose

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Qoyyuum/mcp-metatrader5-server.git
   cd mcp-metatrader5-server
   ```

2. **Create environment file**:
   ```bash
   cp node-server/.env.example node-server/.env
   # Edit node-server/.env with your credentials
   ```

3. **Build and run**:
   ```bash
   docker-compose up -d
   ```

4. **Check logs**:
   ```bash
   docker-compose logs -f mt5-mcp-server
   ```

5. **Stop the service**:
   ```bash
   docker-compose down
   ```

### Using Docker Directly

1. **Build the image**:
   ```bash
   docker build -t mt5-mcp-server:latest .
   ```

2. **Run the container**:
   ```bash
   docker run -d \
     --name mt5-mcp-server \
     -p 8080:8080 \
     -e AUTH_TOKEN="your-secret-token" \
     -e MT5_PATH="C:\Program Files\MetaTrader 5\terminal64.exe" \
     -e MT5_LOGIN=123456 \
     -e MT5_PASSWORD="your-password" \
     -e MT5_SERVER="YourBroker-Demo" \
     mt5-mcp-server:latest
   ```

3. **View logs**:
   ```bash
   docker logs -f mt5-mcp-server
   ```

---

## Manual Deployment

For non-containerized deployment:

### Step 1: Install Dependencies

```bash
# Install Python 3.11+
# Install Node.js 20+

# Install Python dependencies
pip install -e .

# Install Node.js dependencies
cd node-server
npm install
```

### Step 2: Configure Environment

```bash
cd node-server
cp .env.example .env
# Edit .env with your credentials
```

### Step 3: Run the Server

```bash
node src/server.js
```

The server will start on the port specified in `NODE_PORT` (default: 8080).

---

## Environment Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AUTH_TOKEN` | Authentication token for API access | `abc123xyz789` |
| `MT5_PATH` | Path to MT5 terminal executable | `C:\Program Files\MetaTrader 5\terminal64.exe` |
| `MT5_LOGIN` | MT5 account number | `123456` |
| `MT5_PASSWORD` | MT5 account password | `your_password` |
| `MT5_SERVER` | MT5 broker server name | `ICMarkets-Demo` |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_PORT` | `8080` | HTTP server port |
| `NODE_ENV` | `production` | Node.js environment |
| `MT5_AUTO_CONNECT` | `true` | Auto-connect to MT5 on each request |
| `PYTHON_EXECUTABLE` | `python` | Python interpreter path |

### Security Best Practices

1. **Generate Strong AUTH_TOKEN**:
   ```bash
   openssl rand -base64 32
   ```

2. **Use Environment-Specific Configurations**:
   - Development: `.env.development`
   - Production: `.env.production`
   - Never commit these files to Git

3. **Rotate Credentials Regularly**:
   - Change `AUTH_TOKEN` every 90 days
   - Use different tokens for different environments

4. **Network Security**:
   - Use HTTPS/TLS in production
   - Implement firewall rules
   - Restrict access by IP if possible

---

## Troubleshooting

### Common Issues

#### 1. Health Check Failing

**Symptoms**: Dokploy shows unhealthy status

**Solutions**:
- Increase `start_period` to 60s (Windows containers are slower to start)
- Check logs: `docker logs mt5-mcp-server`
- Verify port 8080 is accessible
- Test manually: `curl http://localhost:8080/health`

#### 2. MT5 Connection Failed

**Symptoms**: Tools return errors about MT5 not being initialized

**Solutions**:
- Verify MT5 terminal is installed at `MT5_PATH`
- Check MT5 credentials are correct
- Ensure MT5 server name is exact (case-sensitive)
- Try connecting to demo server first
- Check MT5 terminal logs in Windows Event Viewer

#### 3. Authentication Errors

**Symptoms**: 401 Unauthorized responses

**Solutions**:
- Verify `AUTH_TOKEN` is set in environment
- Check `Auth` header is included in requests
- Ensure token matches exactly (no extra spaces)
- Test health endpoint without auth first

#### 4. Container Won't Start

**Symptoms**: Container exits immediately

**Solutions**:
- Check Docker logs: `docker logs mt5-mcp-server`
- Verify all required environment variables are set
- Ensure Windows containers are enabled
- Check available resources (CPU, memory)
- Verify base image compatibility

#### 5. Python Bridge Errors

**Symptoms**: Tools timeout or return Python errors

**Solutions**:
- Check Python is installed: `docker exec mt5-mcp-server python --version`
- Verify PYTHONPATH: `C:\app\src`
- Check MCP package is installed: `pip list | grep mcp-metatrader5-server`
- Review Python logs for specific errors

### Debugging Tips

1. **Enable Verbose Logging**:
   ```bash
   # Set in environment or .env
   DEBUG=*
   LOG_LEVEL=debug
   ```

2. **Test MT5 Connection Manually**:
   ```bash
   docker exec -it mt5-mcp-server python -c "import MetaTrader5 as mt5; print(mt5.initialize())"
   ```

3. **Test API Endpoints**:
   ```bash
   # Health check (no auth required if AUTH_TOKEN not set)
   curl http://localhost:8080/health

   # Get MT5 version
   curl -X POST http://localhost:8080/v1/tools/get_version \
     -H "Auth: YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"params": {}}'
   ```

4. **Check Container Resources**:
   ```bash
   docker stats mt5-mcp-server
   ```

---

## Monitoring and Maintenance

### Health Monitoring

Set up regular health checks:

```bash
# Simple bash script for monitoring
#!/bin/bash
while true; do
  STATUS=$(curl -s http://localhost:8080/health | jq -r '.status')
  if [ "$STATUS" != "ok" ]; then
    echo "Health check failed at $(date)"
    # Send alert (email, Slack, etc.)
  fi
  sleep 60
done
```

### Log Management

Configure log rotation in Docker Compose or Dokploy:

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

### Backup Strategy

For production deployments:
1. Backup MT5 configuration directory
2. Export and version environment configurations
3. Regular database backups (if storing trading history)

### Updates and Upgrades

To update the deployment:

1. **Pull latest code**:
   ```bash
   git pull origin main
   ```

2. **Rebuild image**:
   ```bash
   docker-compose build
   ```

3. **Restart service**:
   ```bash
   docker-compose up -d
   ```

4. **Verify deployment**:
   ```bash
   docker-compose logs -f
   curl http://localhost:8080/health
   ```

---

## Support and Resources

- **Documentation**: https://mcp-metatrader5-server.readthedocs.io
- **Issues**: https://github.com/Qoyyuum/mcp-metatrader5-server/issues
- **MCP Protocol**: https://modelcontextprotocol.io
- **Dokploy Docs**: https://docs.dokploy.com

---

## License

MIT License - See [LICENSE](LICENSE) file for details.
