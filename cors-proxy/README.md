# LibreView CORS Proxy

A simple local proxy server to enable browser access to LibreView API without security concerns of public proxies.

## Why Use This?

- **Privacy**: Your credentials and glucose data never leave your machine
- **Security**: No third-party services involved
- **Reliability**: No rate limits or downtime from public proxies
- **Control**: Run it when you need it, stop it when you don't

## Quick Start

### 1. Install Dependencies

```bash
cd cors-proxy
npm install
```

### 2. Start the Proxy Server

```bash
npm start
```

You should see:
```
╔════════════════════════════════════════════════════════╗
║                                                        ║
║         LibreView CORS Proxy Server                   ║
║                                                        ║
╚════════════════════════════════════════════════════════╝

✓ Server running on http://localhost:3001
✓ Health check: http://localhost:3001/health
✓ Proxy endpoint: http://localhost:3001/proxy?url=TARGET_URL
```

### 3. Configure Your Dashboard

1. Open your Glucose Dashboard
2. Click the **"Live"** button
3. In the **CORS Proxy URL** field, enter:
   ```
   http://localhost:3001/proxy?url=
   ```
4. Enter your LibreView credentials
5. Click **"Connect to LibreView"**

## How It Works

The proxy server:
1. Receives requests from your dashboard
2. Forwards them to LibreView API
3. Returns the response to your dashboard
4. Adds CORS headers so your browser allows the connection

All data stays on your local network. Nothing is sent to external services.

## Troubleshooting

### Server won't start - Port already in use

If port 3001 is already in use, edit `server.js` and change:
```javascript
const PORT = 3001;
```
to a different port (e.g., 3002, 8080, etc.)

Then update the CORS Proxy URL in your dashboard accordingly.

### Dashboard can't connect

1. Make sure the proxy server is running (you should see log messages)
2. Verify the URL in your dashboard matches the server output
3. Check that you included the trailing `?url=` in the proxy URL

### Still having issues?

Check the server logs for error messages. The server logs every request it receives.

## Running in Background

### macOS/Linux

Keep the server running in the background:
```bash
npm start &
```

Stop it later:
```bash
pkill -f "node server.js"
```

### Windows

Use a separate terminal window or install as a service.

## Security Notes

- This server runs on your local machine only
- It's accessible from your local network (0.0.0.0)
- If you want to restrict access, change `0.0.0.0` to `127.0.0.1` in server.js
- No data is logged or stored (except console logs during runtime)

## Requirements

- Node.js 14 or higher
- npm (comes with Node.js)

## Stopping the Server

Press `Ctrl+C` in the terminal where it's running.
