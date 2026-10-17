import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const configureWebpack = require('../webpack.config.cjs');

test('shared metadata is bundled for watch while other dependencies retain Nest defaults', () => {
  const calls = [];
  const originalExternal = (context, callback) => {
    calls.push(context.request);
    callback(null, `commonjs ${context.request}`);
  };
  const options = { externals: [originalExternal], mode: 'none' };
  const configured = configureWebpack(options);
  const external = configured.externals[0];
  external({ request: '@mogak/shared' }, (error, result) => {
    assert.equal(error, undefined);
    assert.equal(result, undefined);
  });
  external({ request: '@nestjs/common' }, (error, result) => {
    assert.equal(error, null);
    assert.equal(result, 'commonjs @nestjs/common');
  });
  assert.deepEqual(calls, ['@nestjs/common']);
  assert.equal(configured.mode, options.mode);
  assert.equal(options.externals[0], originalExternal);
});
