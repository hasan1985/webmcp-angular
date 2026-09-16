import {Rule, SchematicContext, SchematicsException, Tree} from '@angular-devkit/schematics';
import * as ts from 'typescript';

/**
 * `ng generate webmcp-angular:migrate`
 *
 * The payoff for this package's whole premise: once the project is on Angular 22,
 * every core import moves to `@angular/core` and the dependency comes out. If this
 * schematic has to change anything other than an import path, the backport was not
 * actually compatible and the parity suite missed something.
 *
 * What it does NOT do is guess. Imports from the non-core entry points (`/strict`,
 * `/polyfill`, `/bridge`, `/devtools`, `/testing`) have no `@angular/core`
 * equivalent, so they are reported for a human to decide on, never rewritten.
 */

const PACKAGE = 'webmcp-angular';

/**
 * Exports with an `@angular/core` v22 counterpart, mapped to the name Angular uses.
 *
 * The types keep their names; the two functions gain Angular's `Experimental`
 * prefix, which this package deliberately drops.
 */
const CORE_SYMBOLS = new Map([
  ['declareWebMcpTool', 'declareExperimentalWebMcpTool'],
  ['provideWebMcpTools', 'provideExperimentalWebMcpTools'],
  ['WebMcpToolDescriptor', 'WebMcpToolDescriptor'],
  ['WebMcpToolExecute', 'WebMcpToolExecute'],
  ['WebMcpClient', 'WebMcpClient'],
]);

/**
 * Exported from our primary entry point but NOT by `@angular/core` — these are
 * ours, and code using them needs a human.
 */
const NON_CORE_SYMBOLS = new Set([
  'resolveModelContext',
  'isWebMcpSupported',
  'normalizeInputSchema',
  'displayTitle',
  'ModelContextSource',
  'ResolvedModelContext',
  'JsonSchemaForInference',
]);

interface Finding {
  file: string;
  line: number;
  detail: string;
}

export function migrate(options: {path?: string; dryRun?: boolean} = {}): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const root = options.path ?? '/';
    const rewritten: string[] = [];
    const manual: Finding[] = [];
    let checkedFiles = 0;

    tree.getDir(root).visit((path, entry) => {
      if (!path.endsWith('.ts') || path.endsWith('.d.ts')) return;
      if (path.includes('/node_modules/') || path.includes('/dist/')) return;
      if (!entry) return;

      const original = entry.content.toString('utf8');
      if (!original.includes(PACKAGE)) return;
      checkedFiles++;

      const source = ts.createSourceFile(path, original, ts.ScriptTarget.Latest, true);
      const edits: Array<{start: number; end: number; text: string}> = [];

      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement)) continue;
        if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

        const specifier = statement.moduleSpecifier.text;
        if (specifier !== PACKAGE && !specifier.startsWith(`${PACKAGE}/`)) continue;

        const line = source.getLineAndCharacterOfPosition(statement.getStart()).line + 1;

        // A secondary entry point: no @angular/core equivalent exists.
        if (specifier !== PACKAGE) {
          const entryPoint = specifier.slice(PACKAGE.length);
          manual.push({
            file: path,
            line,
            detail: `imports '${specifier}' — '${entryPoint}' has no @angular/core equivalent, so this import must stay or be removed by hand.`,
          });
          continue;
        }

        const named = collectNamedImports(statement);
        if (named === null) {
          manual.push({
            file: path,
            line,
            detail: `uses a namespace or default import from '${PACKAGE}', which this schematic will not rewrite automatically.`,
          });
          continue;
        }

        const ours = named.filter((n) => NON_CORE_SYMBOLS.has(n.imported));
        const unknown = named.filter(
          (n) => !CORE_SYMBOLS.has(n.imported) && !NON_CORE_SYMBOLS.has(n.imported),
        );

        if (ours.length > 0) {
          manual.push({
            file: path,
            line,
            detail: `imports ${ours.map((n) => `'${n.imported}'`).join(', ')} from '${PACKAGE}', which @angular/core does not export. Replace or drop before migrating.`,
          });
          continue;
        }

        if (unknown.length > 0) {
          manual.push({
            file: path,
            line,
            detail: `imports ${unknown.map((n) => `'${n.imported}'`).join(', ')}, which this schematic does not recognise. Check it by hand.`,
          });
          continue;
        }

        // Every symbol here has an @angular/core counterpart. Rewrite the module
        // specifier, and rename the two functions Angular prefixes with
        // `Experimental`.
        //
        // A renamed symbol keeps an alias to the name the file already uses
        // (`declareExperimentalWebMcpTool as declareWebMcpTool`), so only the import
        // line changes. Renaming every usage would mean rewriting identifiers across
        // the file, with shadowing to reason about — more risk than this schematic
        // should take without being asked.
        edits.push({
          start: statement.moduleSpecifier.getStart(),
          end: statement.moduleSpecifier.getEnd(),
          text: `'@angular/core'`,
        });

        for (const element of elementsOf(statement)) {
          const imported = (element.propertyName ?? element.name).text;
          const angularName = CORE_SYMBOLS.get(imported);
          if (!angularName || angularName === imported) continue;

          const local = element.name.text;
          edits.push({
            start: element.getStart(),
            end: element.getEnd(),
            // `x as y` keeps the local name; a bare import needs an alias adding.
            text: element.propertyName
              ? `${angularName} as ${local}`
              : `${angularName} as ${local}`,
          });
        }
      }

      if (edits.length === 0) return;

      let updated = original;
      for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
        updated = updated.slice(0, edit.start) + edit.text + updated.slice(edit.end);
      }

      if (!options.dryRun) {
        tree.overwrite(path, updated);
      }
      rewritten.push(path);
    });

    report(context, {checkedFiles, rewritten, manual, dryRun: options.dryRun === true});

    if (manual.length === 0 && rewritten.length > 0 && !options.dryRun) {
      removeDependency(tree, context);
    }

    return tree;
  };
}

interface NamedImport {
  imported: string;
}

/** The named bindings of an import, or an empty list for other import forms. */
function elementsOf(statement: ts.ImportDeclaration): readonly ts.ImportSpecifier[] {
  const bindings = statement.importClause?.namedBindings;
  return bindings && ts.isNamedImports(bindings) ? bindings.elements : [];
}

/** Returns the named bindings, or null for a default/namespace import. */
function collectNamedImports(statement: ts.ImportDeclaration): NamedImport[] | null {
  const clause = statement.importClause;
  if (!clause) return [];
  if (clause.name) return null; // default import
  if (!clause.namedBindings) return [];
  if (ts.isNamespaceImport(clause.namedBindings)) return null;
  return clause.namedBindings.elements.map((element) => ({
    imported: (element.propertyName ?? element.name).text,
  }));
}

function removeDependency(tree: Tree, context: SchematicContext): void {
  const pkgPath = '/package.json';
  if (!tree.exists(pkgPath)) return;

  let pkg: Record<string, Record<string, string> | unknown>;
  try {
    pkg = JSON.parse(tree.read(pkgPath)!.toString('utf8'));
  } catch {
    throw new SchematicsException('Could not parse package.json.');
  }

  let removed = false;
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const deps = pkg[field] as Record<string, string> | undefined;
    if (deps && PACKAGE in deps) {
      delete deps[PACKAGE];
      removed = true;
    }
  }

  if (removed) {
    tree.overwrite(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    context.logger.info(`  Removed '${PACKAGE}' from package.json. Run your package manager to update the lockfile.`);
  }
}

function report(
  context: SchematicContext,
  result: {checkedFiles: number; rewritten: string[]; manual: Finding[]; dryRun: boolean},
): void {
  const {logger} = context;
  const prefix = result.dryRun ? '[dry run] ' : '';

  if (result.checkedFiles === 0) {
    logger.info(`Nothing to do — no file mentions '${PACKAGE}'.`);
    return;
  }

  if (result.rewritten.length > 0) {
    logger.info(`${prefix}Rewrote imports to '@angular/core' in ${result.rewritten.length} file(s):`);
    for (const file of result.rewritten) logger.info(`  ${file}`);
  } else {
    logger.info(`${prefix}No import was rewritten automatically.`);
  }

  if (result.manual.length > 0) {
    logger.warn(`\n${result.manual.length} import(s) need a decision from you:`);
    for (const finding of result.manual) {
      logger.warn(`  ${finding.file}:${finding.line} — ${finding.detail}`);
    }
    logger.warn(
      `\n'${PACKAGE}' was left in package.json because of the above. ` +
        `Resolve them, re-run, and the dependency will be removed.`,
    );
  }
}
