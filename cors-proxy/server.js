const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const crypto = require('crypto');

const app = express();
const PORT = 3001;

// Enable CORS for all origins (since this is local)
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'LibreView CORS Proxy is running',
    timestamp: new Date().toISOString()
  });
});

// Proxy endpoint - forwards all requests to LibreView API
app.all('/proxy', async (req, res) => {
  try {
    // Get the target URL from query parameter
    const targetUrl = req.query.url;

    if (!targetUrl) {
      return res.status(400).json({
        error: 'Missing url parameter',
        message: 'Usage: /proxy?url=https://api-us.libreview.io/llu/auth/login'
      });
    }

    console.log(`Proxying request to: ${targetUrl}`);

    // Forward the request to LibreView API
    // Build headers object, forwarding all relevant headers from the client
    // Use lowercase header names as LibreView API may be case-sensitive
    const forwardHeaders = {
      'content-type': 'application/json',
      'accept': 'application/json',
      'product': req.get('Product') || req.get('product') || 'llu.android',
      'version': req.get('Version') || req.get('version') || '4.16.0',
    };

    // Forward Authorization header if present (case-insensitive)
    const authHeader = req.get('Authorization') || req.get('authorization');
    if (authHeader) {
      forwardHeaders['authorization'] = authHeader;
    }

    // Compute account-id header from patient-id (required by LibreView API)
    // Accept patient ID from query parameter or header
    const patientId = req.query['patient-id'] || req.get('Patient-Id') || req.get('patient-id');
    if (patientId) {
      // Compute SHA-256 hash of patient ID for account-id header
      const hash = crypto.createHash('sha256').update(patientId).digest('hex');
      forwardHeaders['account-id'] = hash;
      console.log('Computed account-id hash for patient ID:', patientId.substring(0, 8) + '...');
    }

    // Forward user-agent if present (some APIs require it)
    const userAgent = req.get('User-Agent') || req.get('user-agent');
    if (userAgent) {
      forwardHeaders['user-agent'] = userAgent;
    }

    // Forward cache-control headers if present
    const cacheControl = req.get('Cache-Control') || req.get('cache-control');
    if (cacheControl) {
      forwardHeaders['cache-control'] = cacheControl;
    }

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: JSON.stringify(req.body) } : {})
    });

    console.log('Response status:', response.status);

    // Get response data
    const data = await response.json();

    // Forward the response back to the client
    res.status(response.status).json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: 'Proxy request failed',
      message: error.message
    });
  }
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║                                                        ║');
  console.log('║         LibreView CORS Proxy Server                   ║');
  console.log('║                                                        ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`✓ Server running on http://localhost:${PORT}`);
  console.log(`✓ Health check: http://localhost:${PORT}/health`);
  console.log(`✓ Proxy endpoint: http://localhost:${PORT}/proxy?url=TARGET_URL`);
  console.log('');
  console.log('Instructions:');
  console.log(`1. Keep this server running`);
  console.log(`2. In your dashboard, set CORS Proxy URL to: http://localhost:${PORT}/proxy?url=`);
  console.log('3. Connect to LibreView');
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('════════════════════════════════════════════════════════');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n\nShutting down proxy server...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n\nShutting down proxy server...');
  process.exit(0);
});
