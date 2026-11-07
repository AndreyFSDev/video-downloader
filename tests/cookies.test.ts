import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cookieExpiry, detectCookiesKind, normalizeCookies } from '../src/lib/cookies.ts';

function cookieLine(text: string, name: string): string[] {
  const line = text
    .split('\n')
    .find((row) => row.endsWith(`\t${name}`) || row.includes(`\t${name}\t`));
  assert.ok(line, name);
  return line.split('\t');
}

test('json cookies become netscape with a subdomain flag that matches the dot', () => {
  const text = JSON.stringify([
    {
      domain: 'youtube.com',
      name: 'SID',
      value: 'abc',
      path: '/',
      secure: true,
      expirationDate: 2_000_000_000,
    },
  ]);
  const out = normalizeCookies(text);
  const fields = cookieLine(out, 'SID');
  assert.equal(fields[0], '.youtube.com');
  assert.equal(fields[1], 'TRUE');
  assert.equal(fields[4], '2000000000');
  assert.equal(detectCookiesKind(text), 'json-array');
});

test('host-only cookies stay on that host', () => {
  const text = JSON.stringify([
    { domain: 'www.youtube.com', hostOnly: true, name: 'HSID', value: 'abc', path: '/' },
  ]);
  const fields = cookieLine(normalizeCookies(text), 'HSID');
  assert.equal(fields[0], 'www.youtube.com');
  assert.equal(fields[1], 'FALSE');
});

test('missing expiry is not written as already expired', () => {
  assert.ok(cookieExpiry(0) > 1_700_000_000);
  assert.equal(cookieExpiry(1000), 1000);
  assert.equal(cookieExpiry(2_500_000_000_000), 2_500_000_000);
  const out = normalizeCookies(JSON.stringify({ accessToken: 'tok', refreshToken: 'ref' }));
  const fields = cookieLine(out, 'auth');
  assert.equal(fields[0], '.boosty.to');
  assert.ok(Number(fields[4]) > 1_700_000_000);
  assert.deepEqual(JSON.parse(decodeURIComponent(fields[6])), {
    accessToken: 'tok',
    refreshToken: 'ref',
  });
  assert.equal(detectCookiesKind('{"accessToken":"tok"}'), 'boosty-tokens');
});

test('malformed JSON cookies are rejected instead of replacing a usable cookie file', () => {
  assert.throws(() => normalizeCookies('{"cookies":[{"name":"missing-domain"}]}'));
  assert.throws(() => normalizeCookies('not cookies'));
});

test('empty cookie values and Netscape session expiry remain valid', () => {
  const json = JSON.stringify([{ domain: '.example.com', name: 'empty', value: '' }]);
  assert.equal(cookieLine(normalizeCookies(json), 'empty')[6], '');
  const netscape = '# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tFALSE\t\tempty\t';
  assert.equal(normalizeCookies(netscape), netscape);
});

test('Netscape files have a header and consistent domain flags', () => {
  const row = '.example.com\tTRUE\t/\tFALSE\t2000000000\tSID\tdummy';
  assert.equal(normalizeCookies(row), `# Netscape HTTP Cookie File\n${row}`);
  assert.throws(() => normalizeCookies(row.replace('.example.com', 'example.com')));
});

test('wrapped cookie export and netscape text pass through', () => {
  const wrapped = JSON.stringify({
    cookies: [
      {
        domain: '.vimeo.com',
        name: 'vuid',
        value: '1',
        path: '/',
        secure: true,
        expirationDate: 2_000_000_000,
      },
    ],
  });
  assert.equal(cookieLine(normalizeCookies(wrapped), 'vuid')[0], '.vimeo.com');
  const netscape = '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tabc';
  assert.equal(normalizeCookies(`\uFEFF${netscape}`), netscape);
});

test('boosty device id is stored as _clientId for the token reader', () => {
  const out = normalizeCookies(
    JSON.stringify({ accessToken: 'tok', refreshToken: 'ref', deviceId: 'device-1' }),
  );
  assert.equal(cookieLine(out, '_clientId')[6], 'device-1');
});

test('a cookie value with a tab is dropped and the rest is kept', () => {
  const text = JSON.stringify([
    { domain: '.youtube.com', name: 'bad', value: 'a\tb', path: '/' },
    { domain: '.youtube.com', name: 'good', value: 'ok', path: '/', expirationDate: 2_000_000_000 },
  ]);
  const out = normalizeCookies(text);
  assert.equal(out.includes('\tbad\t'), false);
  assert.equal(cookieLine(out, 'good')[6], 'ok');
});
