import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

type LocationBlock = {
  modifier: '' | '=' | '^~' | '~';
  pattern: string;
  body: string;
};

const repoRoot = path.resolve(__dirname, '../../..');
const nginxConfPath = path.join(repoRoot, 'frontend/nginx.conf');
const dockerfilePath = path.join(repoRoot, 'frontend/Dockerfile');

function loadLocationBlocks(configText: string): LocationBlock[] {
  const locations: LocationBlock[] = [];
  const locationRegex = /location\s+(?:(=|\^~|~)\s+)?([^{\s]+)\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = locationRegex.exec(configText)) !== null) {
    const modifier = (match[1] ?? '') as LocationBlock['modifier'];
    const pattern = match[2];
    let braceDepth = 1;
    let index = locationRegex.lastIndex;

    while (index < configText.length && braceDepth > 0) {
      const char = configText[index];
      if (char === '{') braceDepth += 1;
      if (char === '}') braceDepth -= 1;
      index += 1;
    }

    locations.push({
      modifier,
      pattern,
      body: configText.slice(locationRegex.lastIndex, index - 1),
    });

    locationRegex.lastIndex = index;
  }

  return locations;
}

function selectLocation(locations: LocationBlock[], requestPath: string): LocationBlock | undefined {
  const exactMatch = locations.find((location) => location.modifier === '=' && location.pattern === requestPath);
  if (exactMatch) return exactMatch;

  const preferredPrefixMatches = locations
    .filter((location) => location.modifier === '^~' && requestPath.startsWith(location.pattern))
    .sort((left, right) => right.pattern.length - left.pattern.length);
  if (preferredPrefixMatches.length > 0) return preferredPrefixMatches[0];

  const regexMatch = locations.find(
    (location) => location.modifier === '~' && new RegExp(location.pattern).test(requestPath)
  );
  if (regexMatch) return regexMatch;

  const prefixMatches = locations
    .filter((location) => location.modifier === '' && requestPath.startsWith(location.pattern))
    .sort((left, right) => right.pattern.length - left.pattern.length);

  return prefixMatches[0];
}

test('frontend nginx proxies every backend route family and preserves SPA fallback routes', () => {
  const configText = fs.readFileSync(nginxConfPath, 'utf8');
  const locations = loadLocationBlocks(configText);

  const backendPaths = [
    '/api/admin/status',
    '/api/admin/config/entra',
    '/.well-known/openid-configuration',
    '/.well-known/jwks.json',
    '/authorize',
    '/login/entra',
    '/login/aaf',
    '/callback',
    '/callback/entra',
    '/callback/aaf',
    '/entra-eam',
    '/token',
    '/userinfo',
    '/entra-login',
    '/health',
  ];

  for (const requestPath of backendPaths) {
    const location = selectLocation(locations, requestPath);
    assert.ok(location, `Expected a matching nginx location for ${requestPath}`);
    assert.match(location.body, /proxy_pass http:\/\/backend:3001;/, `${requestPath} should proxy to backend:3001`);
  }

  const spaPaths = ['/login', '/backend-logs', '/sessions', '/config/entra', '/entra-redirect'];

  for (const requestPath of spaPaths) {
    const location = selectLocation(locations, requestPath);
    assert.ok(location, `Expected a matching nginx location for ${requestPath}`);
    assert.match(location.body, /try_files \$uri \$uri\/ \/index\.html;/, `${requestPath} should stay on SPA fallback`);
  }
});

test('frontend nginx proxy locations preserve backend request URI and production forwarding headers', () => {
  const configText = fs.readFileSync(nginxConfPath, 'utf8');
  const locations = loadLocationBlocks(configText).filter((location) => /proxy_pass http:\/\/backend:3001;/.test(location.body));

  assert.ok(locations.length > 0, 'Expected proxy locations in frontend nginx config');

  for (const location of locations) {
    assert.match(location.body, /proxy_pass http:\/\/backend:3001;/, 'Proxy pass must not rewrite the request URI');
    assert.match(location.body, /proxy_set_header Host \$host;/, 'Proxy should forward Host');
    assert.match(location.body, /proxy_set_header X-Real-IP \$remote_addr;/, 'Proxy should forward X-Real-IP');
    assert.match(location.body, /proxy_set_header X-Forwarded-Proto https;/, 'Proxy should force HTTPS scheme');
    assert.match(location.body, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/, 'Proxy should append X-Forwarded-For');
  }
});

test('frontend production image copies the nginx config into nginx default.conf', () => {
  const dockerfileText = fs.readFileSync(dockerfilePath, 'utf8');

  assert.match(dockerfileText, /COPY nginx\.conf \/etc\/nginx\/conf\.d\/default\.conf/, 'Frontend image must ship the updated nginx config');
});
