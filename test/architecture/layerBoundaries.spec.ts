import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import ts from 'typescript';

type Violation = Readonly<{ file: string; message: string }>;

const sourceRoot = resolve(process.cwd(), 'src');
const forbiddenDomainPackages = [
  /^@nestjs(?:\/|$)/,
  /^zod(?:\/|$)/,
  /^drizzle-orm(?:\/|$)/,
  /^(?:node:)?https?(?:\/|$)/,
  /^(?:express|fastify|axios)(?:\/|$)/,
];
const forbiddenLayerNames = new Set(['application', 'infrastructure', 'presentation']);

describe('layer boundaries', () => {
  it('keeps source imports and request contracts within the agreed architecture', () => {
    const violations = collectLayerBoundaryViolations(sourceRoot);

    expect(formatViolations(violations)).toEqual([]);
  });

  it('keeps PostgreSQL unique-violation details out of auth and user application services', () => {
    expect(readFileSync('src/auth/application/service/auth.service.ts', 'utf8')).not.toMatch(
      /23505|users_email_unique|social_accounts_provider_user_unique/,
    );
    expect(readFileSync('src/users/application/service/user.service.ts', 'utf8')).not.toMatch(
      /23505|users_nickname_unique/,
    );
  });

  it('rejects dynamic module references and generic type-contract bypasses', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'mogak-layerBoundaries-'));
    try {
      writeFixture(
        root,
        'social/domain/entity/probe.entity.ts',
        `
          type NestType = import('@nestjs/common').NestInterceptor;
          export type ProbeEntity = Readonly<{ id: number }>;
          void import('../../application/service/social.service');
          require('../../infrastructure/repository/social.repository');
        `,
      );
      writeFixture(
        root,
        'social/application/type/probe.query.ts',
        `void import('../../infrastructure/repository/social.repository');`,
      );
      writeFixture(
        root,
        'social/application/type/probe.presentation.ts',
        `void import('../../presentation/controller/social.controller');`,
      );
      writeFixture(
        root,
        'social/presentation/type/probe.infrastructure.ts',
        `type Repository = import('../../infrastructure/repository/social.repository').SocialRepository;`,
      );
      writeFixture(
        root,
        'social/application/type/probe.payload.ts',
        `export class TransportPayload {}`,
      );
      writeFixture(
        root,
        'social/presentation/type/probe.contract.ts',
        `import { z } from 'zod'; export const probeSchema = z.object({ value: z.string() });`,
      );
      writeFixture(
        root,
        'social/presentation/dto/probe.dto.ts',
        `export class TransportPayload {}`,
      );

      expect(formatViolations(collectLayerBoundaryViolations(root))).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            "domain must not import framework, persistence, or HTTP package '@nestjs/common'",
          ),
          expect.stringContaining(
            "domain must not import another application layer '../../application/service/social.service'",
          ),
          expect.stringContaining(
            "domain must not import another application layer '../../infrastructure/repository/social.repository'",
          ),
          expect.stringContaining(
            "application must not import infrastructure '../../infrastructure/repository/social.repository'",
          ),
          expect.stringContaining(
            "application must not import presentation '../../presentation/controller/social.controller'",
          ),
          expect.stringContaining(
            "presentation must not import infrastructure '../../infrastructure/repository/social.repository'",
          ),
          expect.stringContaining('type-contract modules must not declare classes'),
          expect.stringContaining(
            "presentation schema 'probeSchema' must have an exported z.infer type alias",
          ),
          expect.stringContaining('DTO contract paths are not permitted'),
          expect.stringContaining(
            "domain entities must not export 'Entity'-suffixed identifier 'ProbeEntity'",
          ),
        ]),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function collectLayerBoundaryViolations(root: string): Violation[] {
  const files = listTypeScriptFiles(root);
  const violations: Violation[] = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const projectPath = relative(root, file);
    const segments = projectPath.split(sep);
    const imports = collectModuleSpecifiers(sourceFile);

    if (segments.includes('domain')) {
      for (const moduleSpecifier of imports) {
        if (forbiddenDomainPackages.some((pattern) => pattern.test(moduleSpecifier))) {
          violations.push({
            file: projectPath,
            message: `domain must not import framework, persistence, or HTTP package '${moduleSpecifier}'`,
          });
        }
        if (targetsLayer(root, file, moduleSpecifier, forbiddenLayerNames)) {
          violations.push({
            file: projectPath,
            message: `domain must not import another application layer '${moduleSpecifier}'`,
          });
        }
        if (targetsLayer(root, file, moduleSpecifier, new Set(['http']))) {
          violations.push({
            file: projectPath,
            message: `domain must not import HTTP boundary code '${moduleSpecifier}'`,
          });
        }
      }
    }

    if (segments.includes('application')) {
      for (const moduleSpecifier of imports) {
        if (targetsLayer(root, file, moduleSpecifier, new Set(['infrastructure']))) {
          violations.push({
            file: projectPath,
            message: `application must not import infrastructure '${moduleSpecifier}'`,
          });
        }
        if (targetsLayer(root, file, moduleSpecifier, new Set(['presentation']))) {
          violations.push({
            file: projectPath,
            message: `application must not import presentation '${moduleSpecifier}'`,
          });
        }
      }
    }

    if (segments.includes('presentation')) {
      for (const moduleSpecifier of imports) {
        if (targetsLayer(root, file, moduleSpecifier, new Set(['infrastructure']))) {
          violations.push({
            file: projectPath,
            message: `presentation must not import infrastructure '${moduleSpecifier}'`,
          });
        }
      }
    }

    if (isDomainEntity(segments)) {
      for (const identifier of exportedIdentifiers(sourceFile)) {
        if (identifier.endsWith('Entity')) {
          violations.push({
            file: projectPath,
            message: `domain entities must not export 'Entity'-suffixed identifier '${identifier}'`,
          });
        }
      }
    }

    if (hasDtoResidual(source)) {
      violations.push({
        file: projectPath,
        message: 'nestjs-zod/createZodDto are not permitted',
      });
    }

    if (isDtoContractPath(segments)) {
      violations.push({
        file: projectPath,
        message: 'DTO contract paths are not permitted',
      });
    }

    if (isTypeContract(segments) && containsClassDeclaration(sourceFile)) {
      violations.push({
        file: projectPath,
        message: 'type-contract modules must not declare classes',
      });
    }

    if (isPresentationTypeContract(segments)) {
      violations.push(...findPresentationContractViolations(projectPath, sourceFile));
    }
  }

  return violations;
}

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

function writeFixture(root: string, projectPath: string, source: string): void {
  const file = resolve(root, projectPath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, source);
}

function collectModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const moduleSpecifiers = new Set<string>();

  const addModuleSpecifier = (expression: ts.Expression | undefined): void => {
    if (expression !== undefined && ts.isStringLiteralLike(expression)) {
      moduleSpecifiers.add(expression.text);
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addModuleSpecifier(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addModuleSpecifier(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (isDynamicImport || isRequire) addModuleSpecifier(node.arguments[0]);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      addModuleSpecifier(node.argument.literal);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...moduleSpecifiers];
}

function targetsLayer(
  root: string,
  importingFile: string,
  moduleSpecifier: string,
  layers: ReadonlySet<string>,
): boolean {
  if (!moduleSpecifier.startsWith('.')) return false;
  const target = relative(root, resolve(dirname(importingFile), moduleSpecifier));
  return target.split(sep).some((segment) => layers.has(segment));
}

function hasDtoResidual(source: string): boolean {
  return /\b(?:createZodDto|nestjs-zod)\b/.test(source);
}

function isTypeContract(segments: readonly string[]): boolean {
  return segments.includes('type');
}

function isDomainEntity(segments: readonly string[]): boolean {
  return segments.includes('domain') && segments.includes('entity');
}

function isDtoContractPath(segments: readonly string[]): boolean {
  return segments.some(
    (segment) => segment.toLowerCase() === 'dto' || segment.toLowerCase().endsWith('.dto.ts'),
  );
}

function isPresentationTypeContract(segments: readonly string[]): boolean {
  return segments.includes('presentation') && isTypeContract(segments);
}

function containsClassDeclaration(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function exportedIdentifiers(sourceFile: ts.SourceFile): string[] {
  return sourceFile.statements.flatMap((statement) => {
    if (ts.isExportDeclaration(statement)) {
      return statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)
        ? statement.exportClause.elements.map((element) => element.name.text)
        : [];
    }
    if (!isExported(statement)) return [];
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.flatMap((declaration) =>
        ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
      );
    }
    if (
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isFunctionDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      return statement.name === undefined ? [] : [statement.name.text];
    }
    return [];
  });
}

function findPresentationContractViolations(
  projectPath: string,
  sourceFile: ts.SourceFile,
): Violation[] {
  const violations: Violation[] = [];
  const schemas = exportedSchemaNames(sourceFile);
  const inferredSchemas = exportedZodInferredSchemaNames(sourceFile);
  for (const schema of schemas) {
    if (!inferredSchemas.has(schema)) {
      violations.push({
        file: projectPath,
        message: `presentation schema '${schema}' must have an exported z.infer type alias`,
      });
    }
  }

  return violations;
}

function exportedSchemaNames(sourceFile: ts.SourceFile): string[] {
  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isVariableStatement(statement) || !isExported(statement)) return [];
    return statement.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name) && declaration.name.text.endsWith('Schema')
        ? [declaration.name.text]
        : [],
    );
  });
}

function exportedZodInferredSchemaNames(sourceFile: ts.SourceFile): Set<string> {
  const schemas = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isTypeAliasDeclaration(statement) || !isExported(statement)) continue;
    const schema = zInferSchemaName(statement.type);
    if (schema !== null) schemas.add(schema);
  }
  return schemas;
}

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ===
      true
  );
}

function zInferSchemaName(type: ts.TypeNode): string | null {
  if (!ts.isTypeReferenceNode(type) || !ts.isQualifiedName(type.typeName)) return null;
  if (!ts.isIdentifier(type.typeName.left) || type.typeName.left.text !== 'z') return null;
  if (type.typeName.right.text !== 'infer' || type.typeArguments?.length !== 1) return null;

  const [argument] = type.typeArguments;
  return argument !== undefined &&
    ts.isTypeQueryNode(argument) &&
    ts.isIdentifier(argument.exprName)
    ? argument.exprName.text
    : null;
}

function formatViolations(violations: readonly Violation[]): string[] {
  return violations.map(({ file, message }) => `${file}: ${message}`);
}
