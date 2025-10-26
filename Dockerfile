# escape=`
FROM mcr.microsoft.com/windows/servercore:ltsc2022

SHELL ["powershell", "-Command", "$ErrorActionPreference = 'Stop';"]

# Install Node.js LTS
ARG NODE_VERSION=20.17.0
RUN Write-Host "Installing Node.js $env:NODE_VERSION" ; `
    Invoke-WebRequest -UseBasicParsing -Uri ("https://nodejs.org/dist/v{0}/node-v{0}-x64.msi" -f $env:NODE_VERSION) -OutFile node.msi ; `
    Start-Process msiexec.exe -ArgumentList '/i', 'node.msi', '/qn', 'ADDLOCAL=ALL' -Wait ; `
    Remove-Item node.msi -Force

# Install Python 3.11
ARG PYTHON_VERSION=3.11.9
RUN Write-Host "Installing Python $env:PYTHON_VERSION" ; `
    Invoke-WebRequest -UseBasicParsing -Uri ("https://www.python.org/ftp/python/{0}/python-{0}-amd64.exe" -f $env:PYTHON_VERSION) -OutFile python.exe ; `
    Start-Process python.exe -ArgumentList '/quiet', 'InstallAllUsers=1', 'PrependPath=1', 'Include_test=0' -Wait ; `
    Remove-Item python.exe -Force

WORKDIR /app

# Copy project files
COPY src ./src
COPY pyproject.toml ./pyproject.toml
COPY uv.lock ./uv.lock
COPY node-server ./node-server

# Install Python dependencies (including MetaTrader 5 MCP package)
RUN python -m pip install --upgrade pip ; `
    python -m pip install --no-cache-dir .

# Install Node dependencies (none for now, but keep step for future additions)
WORKDIR /app/node-server
RUN if (Test-Path package.json) { npm install --omit=dev } else { Write-Host "package.json missing"; exit 1 }

ENV PYTHONPATH="C:\\app\\src"
ENV NODE_ENV=production
ENV NODE_PORT=8080

EXPOSE 8080

CMD ["node", "src/server.js"]
