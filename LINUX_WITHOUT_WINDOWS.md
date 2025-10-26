# Despliegue en Linux SIN Windows

Esta guía explica cómo desplegar el MT5 MCP Server en Linux cuando **no tienes acceso a una máquina Windows**.

## El Problema

MetaTrader 5 es una aplicación **exclusiva de Windows**:
- ❌ No hay versión nativa para Linux
- ❌ No funciona directamente en contenedores Linux
- ❌ El paquete Python `MetaTrader5` requiere Windows

## Soluciones Disponibles

### Comparación de Opciones

| Opción | Costo | Dificultad | Rendimiento | Estabilidad | Recomendado |
|--------|-------|------------|-------------|-------------|-------------|
| Wine en Docker | $0 | Media | Bajo | Media | ⚠️ Solo desarrollo |
| VPS Windows | $10-20/mes | Baja | Alto | Alta | ✅ Producción |
| VPS Windows Spot | $5-10/mes | Media | Alto | Alta | ✅ Budget |
| PC Windows Local | $0 | Baja | Alto | Alta | ✅ Si tienes Windows |

---

## Opción 1: Wine en Docker (Incluida) ⚠️

Ejecuta MT5 usando Wine (emulador de Windows) dentro de un contenedor Linux.

### ✅ Ventajas
- Todo en un solo contenedor
- No requiere máquina Windows separada
- Gratis (solo pagas por Dokploy)
- Fácil de desplegar

### ❌ Desventajas
- **Rendimiento**: Más lento que Windows nativo (emulación)
- **Estabilidad**: Wine puede tener bugs con MT5
- **Compatibilidad**: Algunas funciones de MT5 pueden no funcionar
- **Recursos**: Requiere más CPU/RAM que Linux nativo
- **Soporte**: Menos documentado, más difícil debuggear

### ⚠️ Recomendación
**Solo para desarrollo/testing**. Para producción, usa un VPS Windows.

### Cómo Usar

#### Paso 1: Actualizar Dokploy

En Dokploy, cambia el Dockerfile:

```yaml
# En dokploy.yaml
build:
  dockerfile: Dockerfile.wine  # Cambiar de Dockerfile.linux
```

O en la UI de Dokploy:
- Build Settings → Dockerfile path: `Dockerfile.wine`

#### Paso 2: Configurar Variables de Entorno

En Dokploy UI:

```bash
# Servidor Node.js
NODE_PORT=8080
NODE_ENV=production
AUTH_TOKEN=<tu-token-seguro>

# Configuración MT5
MT5_PATH=C:\Program Files\MetaTrader 5\terminal64.exe
MT5_LOGIN=<tu-cuenta>
MT5_PASSWORD=<tu-password>
MT5_SERVER=<tu-broker>-Demo
MT5_AUTO_CONNECT=true

# Wine/Display
DISPLAY=:99
WINEARCH=win64
```

#### Paso 3: Desplegar

1. Click "Deploy" en Dokploy
2. **Primera vez tomará 10-15 minutos** (descarga e instala Wine + MT5)
3. Verifica logs: Busca "MT5 MCP Server (Wine Mode)"

#### Paso 4: Verificar

```bash
# Health check
curl http://tu-server:8080/health

# Debería mostrar:
{
  "status": "ok",
  "uptimeSeconds": 30,
  "platform": "linux"
}

# Test detallado (puede fallar si MT5 no está listo)
curl http://tu-server:8080/health/detailed
```

### Limitaciones Conocidas

1. **Primera inicialización lenta**: MT5 puede tardar 5-10 minutos en iniciar por primera vez
2. **GUI no disponible**: Corre en modo headless (sin interfaz gráfica)
3. **Algunas funciones pueden fallar**: Especialmente las relacionadas con gráficos
4. **Mayor uso de recursos**: Wine consume más CPU/RAM
5. **Logs verbosos**: Wine genera muchos warnings (normales)

### Troubleshooting

**Problema: MT5 no se conecta**

```bash
# Conéctate al contenedor
docker exec -it <container-id> bash

# Verifica Wine
wine --version

# Verifica MT5
ls -la "$WINEPREFIX/drive_c/Program Files/MetaTrader 5/"

# Prueba manualmente
wine "$WINEPREFIX/drive_c/Program Files/MetaTrader 5/terminal64.exe" /version
```

**Problema: Errores de display**

```bash
# Verifica Xvfb está corriendo
ps aux | grep Xvfb

# Reinicia display
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 &
```

---

## Opción 2: VPS Windows Económico (RECOMENDADO) ✅

Alquila un pequeño VPS Windows solo para ejecutar MT5 Bridge.

### Proveedores Recomendados

#### 1. **Contabo** - MÁS ECONÓMICO
- **Precio**: ~€5-8/mes (aprox $5-10 USD)
- **Specs**: 4 vCPU, 6GB RAM, 200GB SSD
- **Windows**: Windows Server 2019/2022
- **Ubicación**: Europa, USA, Asia
- **Web**: https://contabo.com

**Ventajas:**
- ✅ Muy económico
- ✅ Recursos generosos
- ✅ Windows Server incluido
- ❌ Soporte básico

#### 2. **Vultr**
- **Precio**: ~$10-15/mes
- **Specs**: 1 vCPU, 2GB RAM, 55GB SSD
- **Windows**: Windows Server 2019/2022
- **Ubicación**: 25+ datacenters
- **Web**: https://vultr.com

**Ventajas:**
- ✅ Deploy en segundos
- ✅ Facturación por hora
- ✅ Red rápida
- ❌ Más caro que Contabo

#### 3. **DigitalOcean**
- **Precio**: ~$24/mes (Windows más caro)
- **Specs**: 2 vCPU, 2GB RAM, 60GB SSD
- **Windows**: Windows Server 2019/2022
- **Web**: https://digitalocean.com

**Ventajas:**
- ✅ UI excelente
- ✅ Documentación completa
- ❌ Más caro para Windows

#### 4. **AWS EC2 (Spot Instances)** - OPCIÓN AVANZADA
- **Precio**: ~$5-8/mes (spot pricing)
- **Specs**: t3.small (2 vCPU, 2GB RAM)
- **Windows**: Windows Server 2019/2022
- **Web**: https://aws.amazon.com

**Ventajas:**
- ✅ Muy barato con spot instances
- ✅ Infraestructura sólida
- ❌ Complejidad alta
- ⚠️ Spot instances pueden terminar

### Configuración Paso a Paso (Ejemplo con Contabo)

#### 1. Crear VPS Windows

1. Ve a https://contabo.com
2. Selecciona "Cloud VPS"
3. Elige plan más económico (VPS S - ~€5/mes)
4. Sistema Operativo: **Windows Server 2022**
5. Crea y espera ~10 minutos

#### 2. Conectar al VPS

```bash
# Recibirás credenciales por email
Usuario: Administrator
Password: <password-generado>
IP: <tu-ip-publica>

# Conéctate usando RDP (Remote Desktop)
# Windows: mstsc.exe
# Mac: Microsoft Remote Desktop
# Linux: remmina o rdesktop
```

#### 3. Instalar Requisitos

En el VPS Windows:

```powershell
# Instalar Chocolatey (package manager)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Instalar Python y Git
choco install python git -y

# Reinicia PowerShell

# Verifica instalación
python --version
git --version
```

#### 4. Instalar MT5

1. Descarga MT5 desde tu broker o https://www.metatrader5.com/
2. Ejecuta el instalador
3. Completa la configuración inicial
4. Verifica que puedas abrir MT5 y conectar

#### 5. Configurar Bridge Server

```powershell
# Clona el repositorio
cd C:\
git clone https://github.com/SimonLexRS/mcp-metatrader5-server.git
cd mcp-metatrader5-server\windows-bridge

# Crea entorno virtual
python -m venv venv
.\venv\Scripts\Activate.ps1

# Instala dependencias
pip install -r requirements.txt

# Configura .env
copy .env.example .env
notepad .env
```

Edita `.env`:
```env
MT5_BRIDGE_HOST=0.0.0.0
MT5_BRIDGE_PORT=5555
AUTH_TOKEN=<genera-token-seguro>
MT5_PATH=C:\Program Files\MetaTrader 5\terminal64.exe
MT5_LOGIN=<tu-cuenta>
MT5_PASSWORD=<tu-password>
MT5_SERVER=<tu-broker>-Demo
MT5_AUTO_CONNECT=true
```

#### 6. Configurar Firewall

```powershell
# Permite puerto 5555
New-NetFirewallRule -DisplayName "MT5 Bridge Server" `
  -Direction Inbound `
  -LocalPort 5555 `
  -Protocol TCP `
  -Action Allow
```

#### 7. Ejecutar como Servicio

Descarga NSSM: https://nssm.cc/download

```powershell
# Instala como servicio
nssm install MT5Bridge "C:\mcp-metatrader5-server\windows-bridge\venv\Scripts\python.exe" `
  "C:\mcp-metatrader5-server\windows-bridge\mt5-bridge-server.py"

nssm set MT5Bridge AppDirectory "C:\mcp-metatrader5-server\windows-bridge"
nssm set MT5Bridge DisplayName "MT5 Bridge Server"
nssm set MT5Bridge Start SERVICE_AUTO_START

# Inicia el servicio
nssm start MT5Bridge

# Verifica
nssm status MT5Bridge
```

#### 8. Configurar Dokploy

En Dokploy, usa `Dockerfile.linux` y configura:

```bash
# En variables de entorno
MT5_BRIDGE_URL=http://<IP-VPS-WINDOWS>:5555
MT5_BRIDGE_TOKEN=<mismo-token-del-vps>
AUTH_TOKEN=<tu-token-api>
NODE_PORT=8080
```

#### 9. Verificar

```bash
# Desde cualquier lugar
curl http://<IP-VPS-WINDOWS>:5555/health

# Desde Dokploy
curl http://tu-dokploy:8080/health/detailed
```

### Costo Mensual Total

**Escenario Budget (Contabo):**
- Dokploy (VPS Linux): $5-10/mes
- VPS Windows (Contabo): $5-8/mes
- **Total: $10-18/mes**

**Escenario Standard (Vultr):**
- Dokploy (VPS Linux): $10-15/mes
- VPS Windows (Vultr): $10-15/mes
- **Total: $20-30/mes**

---

## Opción 3: AWS/Azure con Free Tier

Ambos ofrecen períodos de prueba gratuitos para Windows VPS.

### AWS Free Tier
- **12 meses gratis**: t2.micro Windows (1 vCPU, 1GB RAM)
- **Limitación**: 750 horas/mes (suficiente para 24/7)
- **Después**: ~$10-15/mes

### Azure Free Tier
- **12 meses gratis**: B1s Windows (1 vCPU, 1GB RAM)
- **Limitación**: 750 horas/mes
- **Después**: ~$15-20/mes

**Ideal para:**
- ✅ Probar el sistema gratis por un año
- ✅ Startups/proyectos nuevos
- ❌ Requiere tarjeta de crédito
- ⚠️ Configuración más compleja

---

## Opción 4: PC Windows en Casa

Si tienes un PC Windows (aunque no lo uses activamente), úsalo como bridge server.

### Ventajas
- ✅ **Gratis** (ya tienes el hardware)
- ✅ Sin límites de recursos
- ✅ Control total

### Desventajas
- ❌ Debe estar encendido 24/7
- ❌ Consume electricidad
- ❌ Requiere IP estática o DNS dinámico
- ❌ Configuración de router/firewall

### Configuración

1. **Instala bridge server** (igual que VPS, ver arriba)
2. **Configura port forwarding** en tu router:
   - Puerto externo: 5555
   - Puerto interno: 5555
   - IP: Tu PC Windows
3. **Usa DynDNS** si no tienes IP estática:
   - https://www.noip.com (gratis)
   - https://duckdns.org (gratis)
4. **En Dokploy**:
   ```bash
   MT5_BRIDGE_URL=http://tu-dns-dinamico.com:5555
   ```

---

## Comparación de Costos

### Por 1 Año

| Opción | Setup | Mensual | Anual | Complejidad |
|--------|-------|---------|-------|-------------|
| Wine en Docker | $0 | $5-10 | $60-120 | Media |
| VPS Windows (Contabo) | $0 | $5-8 | $60-96 | Baja |
| VPS Windows (Vultr) | $0 | $10-15 | $120-180 | Baja |
| AWS Free Tier | $0 | $0 (12m) | $0 | Alta |
| PC Casa | $0 | $0 | $0* | Media |

*Costo de electricidad no incluido

---

## Recomendación Final

### Para Desarrollo/Testing
✅ **Usa Wine** (Dockerfile.wine)
- Es gratis y rápido de configurar
- Perfecto para probar y desarrollar
- No requiere Windows

### Para Producción
✅ **Usa VPS Windows** (Contabo/Vultr)
- Solo $5-15/mes adicionales
- Mucho más estable
- Mejor rendimiento
- Soporte del proveedor

### Para Proyectos Personales
✅ **Usa PC Windows en casa** (si tienes)
- Gratis
- Recursos ilimitados
- Ideal si ya tienes Windows

---

## Guía Rápida: ¿Qué Opción Elegir?

```
┌─────────────────────────────────────┐
│ ¿Tienes un PC Windows en casa?     │
└──────────┬──────────────────────────┘
           │
    ┌──────┴──────┐
    │             │
   SÍ            NO
    │             │
    v             v
┌────────┐   ┌────────────────┐
│ Úsalo  │   │ ¿Es para prod? │
│ gratis │   └───────┬────────┘
└────────┘           │
              ┌──────┴──────┐
              │             │
             SÍ            NO
              │             │
              v             v
        ┌──────────┐   ┌─────────┐
        │ VPS Win  │   │  Wine   │
        │ $5-15/mo │   │  Gratis │
        └──────────┘   └─────────┘
```

---

## Preguntas Frecuentes

**P: ¿Wine es confiable para producción?**
R: No recomendado. Funciona, pero puede tener problemas de estabilidad. Mejor para desarrollo.

**P: ¿Cuál VPS Windows es el más barato?**
R: Contabo (~$5-8/mes) o AWS Spot Instances (~$5/mes).

**P: ¿Puedo usar el free tier de AWS/Azure?**
R: Sí, 12 meses gratis. Perfecto para probar.

**P: ¿Necesito Windows Server o sirve Windows 10?**
R: Ambos funcionan. Server es mejor para servidores, pero 10/11 funciona bien.

**P: ¿Puedo ejecutar MT5 en Raspberry Pi?**
R: No directamente. Podrías intentar Wine, pero el rendimiento sería muy pobre.

---

## Próximos Pasos

1. **Decide tu opción** basado en presupuesto y necesidades
2. **Sigue la guía correspondiente**:
   - Wine: Ver sección "Opción 1" arriba
   - VPS: Ver [HYBRID_DEPLOYMENT.md](HYBRID_DEPLOYMENT.md)
   - PC casa: Ver [HYBRID_DEPLOYMENT.md](HYBRID_DEPLOYMENT.md)
3. **Despliega en Dokploy**
4. **Prueba con n8n**: Ver [N8N_INTEGRATION.md](N8N_INTEGRATION.md)

---

## Soporte

- **GitHub Issues**: https://github.com/Qoyyuum/mcp-metatrader5-server/issues
- **Documentación**: Ver otros archivos .md en el repositorio

---

## Licencia

MIT License
