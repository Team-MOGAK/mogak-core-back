import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

import { describe, expect, it } from '@jest/globals';
import ts from 'typescript';

const REQUIRED_METADATA = ['alertEligible', 'event', 'errorId'] as const;
type RequiredMetadata = (typeof REQUIRED_METADATA)[number];

const SOURCE_ROOTS = [resolve(process.cwd(), 'apps/api/src'), resolve(process.cwd(), 'libs')];

type ContractViolation = Readonly<{
  file: string;
  line: number;
  column: number;
  message: string;
}>;

type SourceFileEntry = Readonly<{
  file: string;
  sourceFile: ts.SourceFile;
}>;

type HelperDeclaration = ts.FunctionDeclaration | ts.VariableDeclaration;
type HelperDeclarations = ReadonlyMap<string, readonly HelperDeclaration[]>;

describe('오류 알림 로그 계약', () => {
  it('런타임 소스의 모든 .error() 호출이 알림 메타데이터를 직접 선언한다', () => {
    expect(findErrorLogContractViolations(SOURCE_ROOTS)).toEqual([]);
  });

  it('메타데이터가 빠진 객체, 불투명 payload, spread 전용 payload를 거부한다', () => {
    const violations = findErrorLogContractViolationsFromSource(
      `
        const missing = { event: 'test', errorId: 'id' };
        const opaque = { event: 'test', errorId: 'id', alertEligible: true };
        const spreadOnly = { ...opaque };
        logger.error({ event: 'test', errorId: 'id' });
        logger.error(opaque);
        logger.error(spreadOnly);
      `,
    );

    expect(violations).toHaveLength(3);
    expect(violations.map(({ message }) => message)).toEqual([
      'error payload must explicitly declare alertEligible',
      'error payload must be an object literal or a verified explicitly typed helper',
      'error payload must be an object literal or a verified explicitly typed helper',
    ]);
  });

  it('직접 객체와 명시적 반환 타입 및 직접 반환 객체를 가진 helper를 허용한다', () => {
    const violations = findErrorLogContractViolationsFromSource(
      `
        type ErrorAlertPayload = {
          alertEligible: boolean;
          event: string;
          errorId: string;
        };
        function createPayload(): ErrorAlertPayload {
          return { alertEligible: true, event: 'test', errorId: 'id' };
        }
        logger.error({
          alertEligible: true,
          event: 'test',
          errorId: 'direct-id',
          ...{ detail: 'safe' },
        });
        logger.error(createPayload(), 'test');
      `,
    );

    expect(violations).toEqual([]);
  });

  it('명시적 타입이 있어도 helper가 spread만 반환하면 거부한다', () => {
    const violations = findErrorLogContractViolationsFromSource(
      `
        type ErrorAlertPayload = {
          alertEligible: boolean;
          event: string;
          errorId: string;
        };
        const base = { alertEligible: true, event: 'test', errorId: 'id' };
        function createPayload(): ErrorAlertPayload {
          return { ...base };
        }
        logger.error(createPayload(), 'test');
      `,
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toBe(
      'error payload must be an object literal or a verified explicitly typed helper',
    );
  });
});

function findErrorLogContractViolations(roots: readonly string[]): ContractViolation[] {
  const sourceFiles = roots.flatMap((root) => listSourceFiles(root)).map(createSourceFile);
  const helpers = collectHelperDeclarations(sourceFiles);
  return sourceFiles.flatMap(({ file, sourceFile }) =>
    collectSourceViolations(file, sourceFile, helpers),
  );
}

function findErrorLogContractViolationsFromSource(
  source: string,
  file = 'contract-fixture.ts',
): ContractViolation[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const entry: SourceFileEntry = { file, sourceFile };
  return collectSourceViolations(file, sourceFile, collectHelperDeclarations([entry]));
}

function collectSourceViolations(
  file: string,
  sourceFile: ts.SourceFile,
  helpers: HelperDeclarations,
): ContractViolation[] {
  const violations: ContractViolation[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && isLoggerErrorCall(node)) {
      const message = errorPayloadViolation(node, helpers);
      if (message !== undefined) violations.push(createViolation(file, sourceFile, node, message));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function isLoggerErrorCall(node: ts.CallExpression): boolean {
  const expression = unwrapParentheses(node.expression);
  return ts.isPropertyAccessExpression(expression) && expression.name.text === 'error';
}

function errorPayloadViolation(
  call: ts.CallExpression,
  helpers: HelperDeclarations,
): string | undefined {
  const payload = call.arguments[0];
  if (payload === undefined) return 'logger.error() must declare an error payload';
  const directPayload = unwrapParentheses(payload);
  if (ts.isObjectLiteralExpression(directPayload)) {
    const missing = missingMetadata(directPayload);
    return missing.length === 0
      ? undefined
      : `error payload must explicitly declare ${missing.join(', ')}`;
  }
  if (isVerifiedPayload(payload, helpers, new Set<ts.Node>())) return undefined;

  return 'error payload must be an object literal or a verified explicitly typed helper';
}

function isVerifiedPayload(
  expression: ts.Expression,
  helpers: HelperDeclarations,
  seen: Set<ts.Node>,
): boolean {
  const payload = unwrapParentheses(expression);
  if (ts.isObjectLiteralExpression(payload)) return hasRequiredMetadata(payload);

  if (ts.isIdentifier(payload)) {
    const declaration = uniqueDeclaration(helpers, payload.text);
    if (declaration === undefined || seen.has(declaration)) return false;
    seen.add(declaration);

    if (!ts.isVariableDeclaration(declaration) || declaration.type === undefined) return false;
    const initializer = declaration.initializer;
    return initializer !== undefined && isVerifiedPayload(initializer, helpers, seen);
  }

  if (!ts.isCallExpression(payload) || !ts.isIdentifier(payload.expression)) return false;
  const declaration = uniqueDeclaration(helpers, payload.expression.text);
  if (declaration === undefined || seen.has(declaration)) return false;
  seen.add(declaration);
  return isVerifiedTypedHelper(declaration, helpers, seen);
}

function isVerifiedTypedHelper(
  declaration: HelperDeclaration,
  helpers: HelperDeclarations,
  seen: Set<ts.Node>,
): boolean {
  if (ts.isFunctionDeclaration(declaration)) {
    if (declaration.type === undefined || declaration.body === undefined) return false;
    return helperReturnsVerifiedPayload(declaration.body, helpers, seen);
  }

  const initializer = declaration.initializer;
  if (initializer === undefined) return false;
  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    if (declaration.type === undefined && initializer.type === undefined) return false;
    return helperFunctionReturnsVerifiedPayload(initializer, helpers, seen);
  }
  return false;
}

function helperFunctionReturnsVerifiedPayload(
  helper: ts.ArrowFunction | ts.FunctionExpression,
  helpers: HelperDeclarations,
  seen: Set<ts.Node>,
): boolean {
  if (ts.isObjectLiteralExpression(helper.body)) return hasRequiredMetadata(helper.body);
  if (!ts.isBlock(helper.body)) return false;
  return helperReturnsVerifiedPayload(helper.body, helpers, seen);
}

function helperReturnsVerifiedPayload(
  body: ts.Block,
  helpers: HelperDeclarations,
  seen: Set<ts.Node>,
): boolean {
  const returns: ts.Expression[] = [];

  function visit(node: ts.Node): void {
    if (ts.isReturnStatement(node)) {
      if (node.expression !== undefined) returns.push(node.expression);
      return;
    }
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)
    ) {
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(body);
  return (
    returns.length > 0 &&
    returns.every((expression) => isVerifiedPayload(expression, helpers, seen))
  );
}

function hasRequiredMetadata(object: ts.ObjectLiteralExpression): boolean {
  return missingMetadata(object).length === 0;
}

function missingMetadata(object: ts.ObjectLiteralExpression): RequiredMetadata[] {
  const propertyNames = new Set(
    object.properties.flatMap((property) => {
      if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
        return [];
      }
      const name = propertyName(property.name);
      return name === undefined ? [] : [name];
    }),
  );
  return REQUIRED_METADATA.filter((name) => !propertyNames.has(name));
}

function propertyName(name: ts.PropertyName | undefined): RequiredMetadata | undefined {
  if (name === undefined) return undefined;
  const text = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
  return REQUIRED_METADATA.includes(text as RequiredMetadata)
    ? (text as RequiredMetadata)
    : undefined;
}

function collectHelperDeclarations(sourceFiles: readonly SourceFileEntry[]): HelperDeclarations {
  const helpers = new Map<string, HelperDeclaration[]>();

  for (const { sourceFile } of sourceFiles) {
    function visit(node: ts.Node): void {
      if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
        registerHelper(helpers, node.name.text, node);
      } else if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined
      ) {
        registerHelper(helpers, node.name.text, node);
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }

  return helpers;
}

function registerHelper(
  helpers: Map<string, HelperDeclaration[]>,
  name: string,
  declaration: HelperDeclaration,
): void {
  const declarations = helpers.get(name);
  if (declarations === undefined) {
    helpers.set(name, [declaration]);
  } else {
    declarations.push(declaration);
  }
}

function uniqueDeclaration(
  helpers: HelperDeclarations,
  name: string,
): HelperDeclaration | undefined {
  const declarations = helpers.get(name);
  return declarations?.length === 1 ? declarations[0] : undefined;
}

function createViolation(
  file: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  message: string,
): ContractViolation {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    file,
    line: position.line + 1,
    column: position.character + 1,
    message,
  };
}

function listSourceFiles(root: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(root, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      if (['generated', 'node_modules', 'test', 'tests'].includes(entry.name)) continue;
      files.push(...listSourceFiles(path));
      continue;
    }
    if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.test.ts')
    ) {
      files.push(path);
    }
  }

  return files;
}

function createSourceFile(file: string): SourceFileEntry {
  return {
    file: relative(process.cwd(), file).split(sep).join('/'),
    sourceFile: ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
  };
}

function unwrapParentheses(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}
