import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

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
const importPattern =
  /^\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/gm;
const dtoClassPattern =
  /\b(?:abstract\s+)?class\s+[A-Za-z_$][\w$]*(?:Dto|DTO|Request|Response|Command|Query|Result)\b/;

describe('layer boundaries', () => {
  it('keeps source imports and request contracts within the agreed architecture', () => {
    const violations = collectLayerBoundaryViolations(sourceRoot);

    expect(formatViolations(violations)).toEqual([]);
  });
});

function collectLayerBoundaryViolations(root: string): Violation[] {
  const files = listTypeScriptFiles(root);
  const violations: Violation[] = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const projectPath = relative(root, file);
    const segments = projectPath.split(sep);
    const imports = collectModuleSpecifiers(source);

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
      }
    }

    if (hasDtoResidual(projectPath, source)) {
      violations.push({
        file: projectPath,
        message: 'DTO classes and nestjs-zod/createZodDto are not permitted',
      });
    }

    if (isPresentationRequestContract(segments)) {
      violations.push(...findRequestContractViolations(projectPath, source));
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

function collectModuleSpecifiers(source: string): string[] {
  return [...source.matchAll(importPattern)].flatMap((match) => (match[1] ? [match[1]] : []));
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

function hasDtoResidual(projectPath: string, source: string): boolean {
  return (
    /(^|[/.])dto(?:[/.]|$)/i.test(projectPath) ||
    /\bdto\.(?:ts|tsx)$/i.test(projectPath) ||
    /\b(?:createZodDto|nestjs-zod)\b/.test(source) ||
    dtoClassPattern.test(source)
  );
}

function isPresentationRequestContract(segments: readonly string[]): boolean {
  const typeIndex = segments.lastIndexOf('type');
  return (
    segments.includes('presentation') &&
    typeIndex !== -1 &&
    segments.at(-1)?.endsWith('.request.ts') === true
  );
}

function findRequestContractViolations(projectPath: string, source: string): Violation[] {
  const violations: Violation[] = [];
  if (/\bexport\s+(?:abstract\s+)?class\b/.test(source)) {
    violations.push({
      file: projectPath,
      message: 'presentation request contracts must export types, not classes',
    });
  }

  const schemas = [...source.matchAll(/\bexport\s+const\s+(\w+Schema)\s*=/g)].map(
    (match) => match[1],
  );
  for (const schema of schemas) {
    const inferredType = new RegExp(
      `\\bexport\\s+type\\s+\\w+\\s*=\\s*z\\.infer\\s*<\\s*typeof\\s+${schema}\\s*>`,
    );
    if (!inferredType.test(source)) {
      violations.push({
        file: projectPath,
        message: `request schema '${schema}' must have an exported z.infer type alias`,
      });
    }
  }

  return violations;
}

function formatViolations(violations: readonly Violation[]): string[] {
  return violations.map(({ file, message }) => `${file}: ${message}`);
}
