const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Simple .env parser to load environment variables safely without external dependencies
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

const PORT = process.env.PORT || 3000;

// OAuth Validation Configuration
const GOOGLE_IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID || '646212023629-urciv20i6p3sas908ff5le4bsfcft8hm.apps.googleusercontent.com';
const GOOGLE_IOS_REVERSED_CLIENT_ID = process.env.GOOGLE_IOS_REVERSED_CLIENT_ID || 'com.googleusercontent.apps.646212023629-urciv20i6p3sas908ff5le4bsfcft8hm';
const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID || 'workkoutapp';

// Allowed Client IDs for token audience verification
const ALLOWED_AUDIENCES = new Set(
  (process.env.ALLOWED_GOOGLE_CLIENT_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);
ALLOWED_AUDIENCES.add(GOOGLE_IOS_CLIENT_ID);

const MIME = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.plist': 'application/xml',
  '.xml': 'application/xml; charset=UTF-8',
  '.txt': 'text/plain; charset=UTF-8'
};

// ==========================================
// SECURITY: IN-MEMORY RATE LIMITING
// ==========================================
const rateLimitMap = new Map();
const RATE_LIMIT_CLEANUP_INTERVAL = 60 * 1000; // 1 minute

function checkRateLimit(ip, maxRequests = 60, windowMs = 60 * 1000) {
  const now = Date.now();
  let record = rateLimitMap.get(ip);
  if (!record || now - record.windowStart > windowMs) {
    record = { count: 1, windowStart: now };
    rateLimitMap.set(ip, record);
    return true;
  }
  if (record.count >= maxRequests) {
    return false;
  }
  record.count += 1;
  return true;
}

// Periodic cleanup to avoid memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of rateLimitMap.entries()) {
    if (now - rec.windowStart > 120 * 1000) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_LIMIT_CLEANUP_INTERVAL).unref();

// Verify Google ID Token against Google OAuth2 tokeninfo
function verifyGoogleIdToken(idToken) {
  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300 && parsed.sub) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error_description || parsed.error || 'Token verification failed'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Apply baseline HTTP security headers
function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob: data:; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:; " +
    "style-src 'self' 'unsafe-inline' https:; " +
    "font-src 'self' https: data:; " +
    "img-src 'self' data: blob: https:; " +
    "connect-src 'self' https: wss: blob: data:; " +
    "worker-src 'self' blob:; " +
    "frame-ancestors 'none';"
  );
}

const server = http.createServer((req, res) => {
  applySecurityHeaders(res);

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const reqPath = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API ROUTE: Public Configuration (Trimmed to prevent sensitive exposure)
  if (reqPath === '/api/config' && req.method === 'GET') {
    if (!checkRateLimit(`config_${clientIp}`, 60, 60000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many requests. Please slow down.' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      google: {
        projectId: GOOGLE_PROJECT_ID,
        iosClientId: GOOGLE_IOS_CLIENT_ID
      }
    }));
    return;
  }

  // API ROUTE: Google OAuth ID Token Verification (Rate-limited, size-bounded, validated)
  if (reqPath === '/api/auth/google/verify' && req.method === 'POST') {
    if (!checkRateLimit(`auth_${clientIp}`, 15, 60000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ valid: false, error: 'Too many authentication attempts. Please wait 1 minute.' }));
      return;
    }

    let body = '';
    let bodySize = 0;
    let tooLarge = false;
    const MAX_BODY_SIZE = 32 * 1024; // 32KB max payload limit to prevent buffer exhaustion

    req.on('error', (err) => {
      // Safe catch for aborted or reset client sockets
    });

    req.on('data', chunk => {
      if (tooLarge) return;
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_SIZE) {
        tooLarge = true;
        res.writeHead(413, { 'Content-Type': 'application/json', 'Connection': 'close' });
        res.end(JSON.stringify({ valid: false, error: 'Payload too large' }));
        req.resume();
        return;
      }
      body += chunk;
    });

    req.on('end', async () => {
      if (tooLarge) return;

      try {
        let payload;
        try {
          payload = JSON.parse(body || '{}');
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ valid: false, error: 'Malformed JSON payload' }));
          return;
        }

        const { idToken, platform } = payload;

        // Input validation
        if (!idToken || typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 4096) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ valid: false, error: 'Invalid or missing idToken parameter' }));
          return;
        }

        const validPlatforms = ['ios', 'android', 'web'];
        const safePlatform = validPlatforms.includes(platform) ? platform : 'web';

        const tokenData = await verifyGoogleIdToken(idToken);

        // Verify audience
        const tokenAud = tokenData.aud;
        const isValidAudience = ALLOWED_AUDIENCES.has(tokenAud) || 
          tokenAud.startsWith('646212023629') ||
          tokenData.azp === GOOGLE_IOS_CLIENT_ID;

        if (!isValidAudience) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            valid: false,
            error: 'Unauthorized token audience'
          }));
          return;
        }

        // Token verified — return safe, trimmed user object
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          valid: true,
          platform: safePlatform,
          user: {
            uid: tokenData.sub,
            email: tokenData.email || '',
            emailVerified: Boolean(tokenData.email_verified === 'true' || tokenData.email_verified === true),
            name: tokenData.name || 'Dead Lock Athlete',
            picture: tokenData.picture || ''
          }
        }));
      } catch (err) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: false, error: 'Token validation error' }));
      }
    });
    return;
  }

  // API ROUTE: Health check
  if (reqPath === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // STATIC FILE SERVING WITH PATH TRAVERSAL PROTECTION
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(__dirname, safePath);

  // Default to index.html for root or directory access
  if (filePath === __dirname || filePath === path.join(__dirname, path.sep)) {
    filePath = path.join(__dirname, 'index.html');
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // Path traversal check
  if (!filePath.startsWith(__dirname)) {
    serve404(res);
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      serve404(res);
    } else {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': (ext === '.html' || ext === '.js') ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600'
      });
      res.end(data);
    }
  });
});

function serve404(res) {
  const notFoundPath = path.join(__dirname, '404.html');
  fs.readFile(notFoundPath, (err, data) => {
    if (!err && data) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end(data);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 — Page Not Found');
    }
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Dead Lock] Port ${PORT} is already in use.`);
  } else {
    console.error('[Dead Lock] Server error:', err);
  }
});

server.on('clientError', (err, socket) => {
  if (err.code === 'ECONNRESET' || !socket.writable) {
    return;
  }
  try {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  } catch (e) {}
});

process.on('uncaughtException', (err) => {
  console.error('[Dead Lock] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Dead Lock] Unhandled Rejection:', reason);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Dead Lock] Server listening securely on port ${PORT}`);
});
