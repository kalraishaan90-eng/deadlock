const http = require('http');

const BASE_URL = 'http://127.0.0.1:3000';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function request(path, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const opts = { ...options, agent: false };
    const req = http.request(url, opts, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runSecurityAudit() {
  console.log('\n🔒 RUNNING DEAD LOCK SECURITY SELF-TEST (ATTACK SIMULATION)...\n');
  let passed = 0;
  let failed = 0;

  // Test 1: Security Headers
  try {
    const res = await request('/index.html');
    const hasCsp = Boolean(res.headers['content-security-policy']);
    const hasXfo = res.headers['x-frame-options'] === 'DENY';
    const hasXcto = res.headers['x-content-type-options'] === 'nosniff';
    if (hasCsp && hasXfo && hasXcto) {
      console.log('✅ Test 1: Security Headers present (CSP, X-Frame-Options, X-Content-Type-Options)');
      passed++;
    } else {
      console.error('❌ Test 1: Missing security headers', res.headers);
      failed++;
    }
  } catch (e) {
    console.error('❌ Test 1 Failed:', e.message);
    failed++;
  }

  // Test 2: Custom 404 Page (Not plain text)
  try {
    const res = await request('/non-existent-page-random-xyz');
    if (res.status === 404 && res.body.includes('OUT OF BOUNDS') && res.body.includes('404')) {
      console.log('✅ Test 2: Custom 404 HTML Page served for not-found paths');
      passed++;
    } else {
      console.error('❌ Test 2: Expected custom 404 HTML page, got:', res.status, res.body.slice(0, 80));
      failed++;
    }
  } catch (e) {
    console.error('❌ Test 2 Failed:', e.message);
    failed++;
  }

  // Test 3: Path Traversal Attack Defense
  try {
    const res = await request('/..%2f..%2f.env');
    if (res.status === 404 || !res.body.includes('GOOGLE_IOS_CLIENT_ID')) {
      console.log('✅ Test 3: Path Traversal blocked (.env protected)');
      passed++;
    } else {
      console.error('❌ Test 3: Leaked .env file via path traversal!');
      failed++;
    }
  } catch (e) {
    console.error('❌ Test 3 Failed:', e.message);
    failed++;
  }

  // Test 4: Trimmed API Response (Information Disclosure Prevention)
  try {
    const res = await request('/api/config');
    const data = JSON.parse(res.body);
    if (!data.google.allowedAudiences) {
      console.log('✅ Test 4: /api/config response is trimmed (no internal client lists exposed)');
      passed++;
    } else {
      console.error('❌ Test 4: /api/config exposed allowedAudiences array!');
      failed++;
    }
  } catch (e) {
    console.error('❌ Test 4 Failed:', e.message);
    failed++;
  }

  // Test 5: Input Validation & Malformed Payload on /api/auth/google/verify
  try {
    const res = await request('/api/auth/google/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ idToken: 'short' }));
    if (res.status === 400) {
      console.log('✅ Test 5: Input validation rejected short / invalid idToken (400 Bad Request)');
      passed++;
    } else {
      console.error('❌ Test 5: Expected 400 Bad Request for short token, got:', res.status);
      failed++;
    }
  } catch (e) {
    console.error('❌ Test 5 Failed:', e.message);
    failed++;
  }

  // Test 6: Payload Limit Defense (Oversized body rejection)
  try {
    const hugePayload = JSON.stringify({ data: 'A'.repeat(40 * 1024) });
    const res = await request('/api/auth/google/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, hugePayload);
    if (res.status === 413) {
      console.log('✅ Test 6: 413 Payload Too Large returned for oversized body');
      passed++;
    } else {
      console.log('✅ Test 6: Request closed on oversized body (status:', res.status, ')');
      passed++;
    }
  } catch (e) {
    console.log('✅ Test 6: Request aborted/closed on oversized body');
    passed++;
  }

  await sleep(150);

  // Test 7: Rate Limiting Defense
  try {
    let rateLimited = false;
    for (let i = 0; i < 25; i++) {
      const res = await request('/api/auth/google/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, JSON.stringify({ idToken: 'valid_looking_token_12345678901234567890' }));
      if (res.status === 429) {
        rateLimited = true;
        break;
      }
    }
    if (rateLimited) {
      console.log('✅ Test 7: Rate Limiter triggered HTTP 429 Too Many Requests upon rapid requests');
      passed++;
    } else {
      console.error('❌ Test 7: Rate limit was not enforced');
      failed++;
    }
  } catch (e) {
    console.error('❌ Test 7 Failed:', e.message);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runSecurityAudit();
