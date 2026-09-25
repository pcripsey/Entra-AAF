import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const nginxConfPath = path.join(repoRoot, 'frontend/nginx.conf');
const dockerfilePath = path.join(repoRoot, 'frontend/Dockerfile');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getLocationBlock(configText: string, locationHeader: string): string {
  const blockPattern = new RegExp(`${escapeRegExp(locationHeader)}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'm');
  const match = configText.match(blockPattern);
  assert.ok(match, `Expected nginx location block: ${locationHeader}`);
  return match[1];
}

function assertProxyBlock(configText: string, locationHeader: string): void {
  const block = getLocationBlock(configText, locationHeader);
  assert.match(block, /proxy_pass http:\/\/backend:3001;/, `${locationHeader} should proxy to backend:3001`);
  assert.match(block, /proxy_set_header Host \$host;/, `${locationHeader} should forward Host`);
  assert.match(block, /proxy_set_header X-Real-IP \$remote_addr;/, `${locationHeader} should forward X-Real-IP`);
  assert.match(block, /proxy_set_header X-Forwarded-Proto https;/, `${locationHeader} should force HTTPS scheme`);
  assert.match(block, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/, `${locationHeader} should append X-Forwarded-For`);
}

test('frontend nginx declares explicit proxy locations for every backend route family', () => {
  const configText = fs.readFileSync(nginxConfPath, 'utf8');

  const backendLocationHeaders = [
    'location ^~ /api/',
    'location ^~ /.well-known/',
    'location ^~ /login/',
    'location ^~ /callback/',
    'location ~ ^/(authorize|callback|entra-eam|token|userinfo|entra-login|health)/?$',
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

  assert.doesNotMatch(configText, /location\s+(?:=|\^~|~)?\s*\/login\s*\{/, 'React /login should not be swallowed by a backend proxy block');
  assert.doesNotMatch(configText, /location\s+(?:=|\^~|~)?\s*\/backend-logs\s*\{/, 'React /backend-logs should continue to use the SPA fallback');
});

test('frontend production image copies the nginx config into nginx default.conf', () => {
  const dockerfileText = fs.readFileSync(dockerfilePath, 'utf8');

  assert.match(dockerfileText, /COPY nginx\.conf \/etc\/nginx\/conf\.d\/default\.conf/, 'Frontend image must ship the updated nginx config');
});
