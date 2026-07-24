import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from '@jest/globals';
import ts from 'typescript';

const projectRoot = process.cwd();
const moduleRequire = createRequire(resolve(projectRoot, 'package.json'));
const sourcePath = resolve(projectRoot, 'src/common/http/fixed-window-rate-limiter.ts');

describe('FixedWindowRateLimiter CommonJS 모듈 로드', () => {
  it('decorator 의존성을 초기화한 뒤 로드한다', () => {
    const compiled = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2023,
        experimentalDecorators: true,
      },
    });
    const module = { exports: {} };

    expect(() => {
      new Function('require', 'exports', 'module', compiled.outputText)(
        moduleRequire,
        module.exports,
        module,
      );
    }).not.toThrow();
  });
});
