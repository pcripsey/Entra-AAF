import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');
const nginxConfPath = path.join(repoRoot, 'frontend/nginx.conf');
const dockerfilePath = path.join(repoRoot, 'frontend/Dockerfile');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getLocationBlock(configText: string, locationHeader: string): string {
  const headerPattern = new RegExp(`${escapeRegExp(locationHeader)}\\s*\\{`, 'm');
  const match = headerPattern.exec(configText);
  assert.ok(match, `Expected nginx location block: ${locationHeader}`);

  const blockStart = match.index + match[0].length;
  let depth = 1;

  for (let i = blockStart; i < configText.length; i += 1) {
    if (configText[i] === '{') {
      depth += 1;
    } else if (configText[i] === '}') {
      depth -= 1;

      if (depth === 0) {
        return configText.slice(blockStart, i);
      }
    }
  }

  assert.fail(`Expected nginx location block to close: ${locationHeader}`);
}

function assertProxyBlock(configText: string, locationHeader: string): void {
  const block = getLocationBlock(configText, locationHeader);
  assert.match(block, /proxy_pass http:\/\/backend:3001;/, `${locationHeader} should proxy to backend:3001`);
  assert.match(block, /proxy_set_header Host \$host;/, `${locationHeader} should forward Host`);
  assert.match(block, /proxy_set_header X-Real-IP \$remote_addr;/, `${locationHeader} should forward X-Real-IP`);
  assert.match(block, /proxy_set_header X-Forwarded-Proto https;/, `${locationHeader} should force HTTPS scheme`);
  assert.match(block, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/, `${locationHeader} should append X-Forwarded-For`);
}

function normalizeDockerfile(text: string): string {
  return text.replace(/\\\n/g, ' ').replace(/[ \t]+/g, ' ');
}

test('frontend nginx declares explicit proxy locations for every backend route family', () => {
  const configText = fs.readFileSync(nginxConfPath, 'utf8');

  const backendLocationHeaders = [
    'location ^~ /api/',
    'location ^~ /.well-known/',
    'location = /login',
    'location ~ ^/login/(entra|aaf)/?$',
    'location = /callback',
    'location ^~ /callback/',
    'location ^~ /entra-login/',
    'location ~ ^/(authorize|callback|entra-eam|token|userinfo|entra-login|health)(?:/.*)?$',
  ];

  for (const locationHeader of backendLocationHeaders) {
    assertProxyBlock(configText, locationHeader);
  }
});

test('frontend nginx keeps SPA fallback for frontend-only routes', () => {
  const configText = fs.readFileSync(nginxConfPath, 'utf8');
  const spaBlock = getLocationBlock(configText, 'location /');

  assert.match(spaBlock, /root \/usr\/share\/nginx\/html;/, 'SPA fallback should serve the built frontend assets');
  assert.match(spaBlock, /try_files \$uri \$uri\/ \/index\.html;/, 'SPA fallback should keep React client-side routes working');

  assert.doesNotMatch(configText, /location\s+(?:=|\^~|~)?\s*\/backend-logs\s*\{/, 'React /backend-logs should continue to use the SPA fallback');
});

test('frontend nginx keeps descendant backend routes on regex-matched OIDC endpoints', () => {
  const configText = fs.readFileSync(nginxConfPath, 'utf8');
  assertProxyBlock(configText, 'location ~ ^/(authorize|callback|entra-eam|token|userinfo|entra-login|health)(?:/.*)?$');
});

test('frontend production image copies the nginx config into nginx default.conf', () => {
  const dockerfileText = normalizeDockerfile(fs.readFileSync(dockerfilePath, 'utf8'));

  assert.match(
    dockerfileText,
    /COPY (?:--from=\S+ )?\S*nginx\.conf \/etc\/nginx\/conf\.d\/default\.conf(?:\s|$)/,
    'Frontend image must ship the updated nginx config',
  );
});
