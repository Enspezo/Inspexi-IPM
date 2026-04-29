# Convert API — DOCX naar PDF Conversie Service

Standalone NestJS microservice die DOCX-bestanden converteert naar PDF via LibreOffice headless. Draait als apart proces zodat zware conversies de hoofd-API niet blokkeren.

## Architectuur

```
┌─────────────┐     POST /convert/docx-to-pdf     ┌───────────────┐
│  Hoofd-API  │ ──────────────────────────────────►│  Convert API  │
│ (port 3001) │    X-API-Key + multipart DOCX      │  (port 3002)  │
│             │ ◄──────────────────────────────────│               │
└─────────────┘         PDF buffer response         └───────────────┘
                                                          │
                                                    LibreOffice
                                                     (headless)
```

- **Dev**: `http://localhost:3002`
- **Productie**: `https://convert.inspexi.nl`

## Lokale Ontwikkeling

### Vereisten

- Node.js 20+
- LibreOffice geïnstalleerd:
  - **macOS**: `brew install --cask libreoffice`
  - **Ubuntu/Debian**: `sudo apt install libreoffice-writer`
  - **Windows**: Download van [libreoffice.org](https://www.libreoffice.org/)

Controleer installatie:

```bash
soffice --version
```

### Starten

```bash
# Vanuit de root van het project
pnpm install
pnpm dev          # Start alle services (API + Portal + Convert API)

# Of alleen de convert API
cd apps/convert-api
pnpm dev
```

### Testen

```bash
# Health check
curl http://localhost:3002/convert/health

# DOCX naar PDF conversie
curl -X POST \
  -H "X-API-Key: dev-convert-secret" \
  -F "file=@document.docx" \
  http://localhost:3002/convert/docx-to-pdf \
  -o output.pdf
```

## Environment Variabelen

### Convert API (`apps/convert-api/.env`)

| Variabele | Standaard | Omschrijving |
|-----------|-----------|-------------|
| `CONVERT_API_PORT` | `3002` | Poort waarop de service draait |
| `CONVERT_API_KEY` | — | Gedeelde API-sleutel voor authenticatie |
| `CONVERT_TIMEOUT_MS` | `60000` | LibreOffice conversie timeout (ms) |

### Hoofd-API (`apps/api/.env`)

| Variabele | Standaard | Omschrijving |
|-----------|-----------|-------------|
| `CONVERT_API_URL` | `http://localhost:3002` | URL van de convert service |
| `CONVERT_API_KEY` | — | Moet overeenkomen met convert API |

## API Endpoint

### `POST /convert/docx-to-pdf`

Converteert een DOCX-bestand naar PDF.

**Authenticatie**: `X-API-Key` header (verplicht)

**Request**: `multipart/form-data`
- `file`: DOCX-bestand (max 50 MB)

**Response**: `application/pdf` (binary)

**Foutcodes**:
- `400` — Geen bestand geüpload
- `401` — Ongeldige of ontbrekende API-sleutel
- `500` — LibreOffice conversie mislukt of timeout

### `GET /convert/health`

Health check (geen authenticatie).

**Response**: `{ "status": "ok", "service": "convert-api" }`

## Docker Deployment

### Build & Run

```bash
# Build vanuit project root
cd apps/convert-api
pnpm build

# Docker image bouwen
docker build -t inspexi-convert-api -f apps/convert-api/Dockerfile .

# Draaien
docker run -d \
  --name inspexi-convert-api \
  -p 3002:3002 \
  -e CONVERT_API_KEY=je-productie-sleutel \
  -e CONVERT_TIMEOUT_MS=60000 \
  inspexi-convert-api
```

### Docker Compose

De service is opgenomen in `docker-compose.yml`:

```bash
# Start alles (postgres + convert-api)
docker compose up -d

# Of alleen de convert API
docker compose up -d convert-api
```

## Productie Setup (`convert.inspexi.nl`)

### 1. Server Vereisten

- Linux (Ubuntu 22.04+ aanbevolen)
- Docker + Docker Compose
- Of: Node.js 20+ met LibreOffice (`sudo apt install libreoffice-writer fonts-liberation fonts-dejavu`)
- Minimaal 1 GB RAM (LibreOffice is geheugenintensief)

### 2. Environment

Maak `/opt/convert-api/.env`:

```env
CONVERT_API_PORT=3002
CONVERT_API_KEY=<genereer-sterke-sleutel>
CONVERT_TIMEOUT_MS=60000
```

Genereer een veilige sleutel:

```bash
openssl rand -base64 32
```

### 3. Nginx Reverse Proxy

Configureer nginx voor `convert.inspexi.nl`:

```nginx
server {
    listen 443 ssl http2;
    server_name convert.inspexi.nl;

    ssl_certificate     /etc/letsencrypt/live/convert.inspexi.nl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/convert.inspexi.nl/privkey.pem;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # LibreOffice conversies kunnen lang duren
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}

# HTTP → HTTPS redirect
server {
    listen 80;
    server_name convert.inspexi.nl;
    return 301 https://$host$request_uri;
}
```

SSL-certificaat aanvragen:

```bash
sudo certbot --nginx -d convert.inspexi.nl
```

### 4. Systemd Service (zonder Docker)

Als je zonder Docker wilt draaien:

```ini
# /etc/systemd/system/convert-api.service
[Unit]
Description=InspeXi Convert API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/convert-api
EnvironmentFile=/opt/convert-api/.env
ExecStart=/usr/bin/node dist/main
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable convert-api
sudo systemctl start convert-api
```

### 5. Hoofd-API Configuratie

Voeg toe aan de hoofd-API `.env` op de productieserver:

```env
CONVERT_API_URL=https://convert.inspexi.nl
CONVERT_API_KEY=<dezelfde-sleutel-als-convert-api>
```

## Troubleshooting

### LibreOffice niet gevonden

```
Error: Could not find soffice binary
```

LibreOffice is niet geïnstalleerd of niet in het PATH.

```bash
# Controleer installatie
which soffice
soffice --version

# macOS
brew install --cask libreoffice

# Ubuntu/Debian
sudo apt install libreoffice-writer
```

### Conversie timeout

```
Error: Conversie timeout na 60 seconden
```

Het document is te groot of te complex. Verhoog `CONVERT_TIMEOUT_MS` of splits het document op.

### Geheugenprobleem

LibreOffice kan veel geheugen gebruiken bij grote documenten. Controleer beschikbaar geheugen:

```bash
free -h
```

Overweeg de server op te schalen naar minimaal 2 GB RAM bij frequente conversies.

### Connect API niet bereikbaar

```
Error: PDF conversie mislukt. Convert service niet bereikbaar.
```

Controleer:
1. Is de convert API draaiend? `curl http://localhost:3002/convert/health`
2. Klopt `CONVERT_API_URL` in de hoofd-API `.env`?
3. Komt `CONVERT_API_KEY` overeen in beide `.env` bestanden?
4. Firewall/netwerk: is poort 3002 bereikbaar tussen de servers?
