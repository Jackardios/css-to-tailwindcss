#!/usr/bin/env node
import { existsSync, promises as fileSystem } from 'fs';
import fg from 'fast-glob';
import mri from 'mri';
import type { AcceptedPlugin } from 'postcss';
import { dirname, isAbsolute, join, parse, relative, resolve } from 'path';
import type { Config } from 'tailwindcss';
import { TailwindConverter } from './TailwindConverter';

const CONFIG_FILE_NAMES = ['tailwind.config.js', 'tailwind.config.cjs'];

const HELP_TEXT = [
  'Usage: css-to-tailwindcss [options] <glob...>',
  '',
  'Options:',
  '  -c, --config <path>                  Use this Tailwind config for every input',
  '      --rem-in-px <number>              Set the pixel size of 1rem',
  '      --arbitrary-properties-is-enabled',
  '                                        Convert unsupported declarations',
  '                                        to arbitrary properties',
  '      --arbitrary-variants             Convert unmatched media and supports rules to variants',
  '      --strict                         Prefer exact values or leave declarations as CSS',
  '      --postcss-plugin <module>        Load a PostCSS plugin (repeatable)',
  '  -h, --help                           Show this help',
  '',
  'Without --config, each input uses the nearest tailwind.config.js or',
  'tailwind.config.cjs found while walking up from its directory.',
  '',
].join('\n');

type ParsedArguments = {
  _: string[];
  help: boolean;
  config?: string;
  'rem-in-px'?: number;
  'arbitrary-properties-is-enabled': boolean;
  'arbitrary-variants': boolean;
  strict: boolean;
  'postcss-plugin'?: string | string[];
};

function parseOptions(argv: string[]) {
  return mri<ParsedArguments>(argv, {
    alias: {
      c: 'config',
      h: 'help',
    },
    boolean: [
      'help',
      'arbitrary-properties-is-enabled',
      'arbitrary-variants',
      'strict',
    ],
    string: ['config', 'postcss-plugin'],
    default: {
      help: false,
      'arbitrary-properties-is-enabled': false,
      'arbitrary-variants': false,
      strict: false,
    },
    unknown(flag) {
      throw new Error(`Unknown option: ${flag}`);
    },
  });
}

function findInParent<T>(
  startDirectory: string,
  findHere: (directory: string) => T | undefined
): T | undefined {
  let directory = resolve(startDirectory);
  let parentDirectory = dirname(directory);

  while (directory !== parentDirectory) {
    const result = findHere(directory);

    if (result !== undefined) {
      return result;
    }

    directory = parentDirectory;
    parentDirectory = dirname(directory);
  }

  return findHere(directory);
}

function findTailwindConfig(inputPath: string): string | undefined {
  return findInParent(dirname(inputPath), directory => {
    for (const fileName of CONFIG_FILE_NAMES) {
      const candidate = join(directory, fileName);

      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return undefined;
  });
}

function findPackageRoot(inputPath: string): string {
  const packageRoot = findInParent(dirname(inputPath), directory =>
    existsSync(join(directory, 'package.json')) ? directory : undefined
  );

  return packageRoot ?? parse(resolve(dirname(inputPath))).root;
}

function unwrapDefaultExport(value: unknown): unknown {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'default' in value
  ) {
    return value.default;
  }

  return value;
}

function isTailwindConfig(value: unknown): value is Config {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadTailwindConfig(configPath: string): Config {
  const loadedConfig: unknown = require(configPath);
  const config = unwrapDefaultExport(loadedConfig);

  if (!isTailwindConfig(config)) {
    throw new Error(`Tailwind config must export an object: ${configPath}`);
  }

  return config;
}

function isAcceptedPostCssPlugin(value: unknown): value is AcceptedPlugin {
  return (
    typeof value === 'function' ||
    typeof value === 'string' ||
    (typeof value === 'object' && value !== null)
  );
}

function loadPostCssPlugins(
  moduleNames: string | string[] | undefined,
  packageRoot: string
): AcceptedPlugin[] {
  const plugins: AcceptedPlugin[] = [];
  const names =
    moduleNames === undefined
      ? []
      : Array.isArray(moduleNames)
      ? moduleNames
      : [moduleNames];

  for (const moduleName of names) {
    const modulePath =
      isAbsolute(moduleName) || moduleName.startsWith('.')
        ? resolve(packageRoot, moduleName)
        : require.resolve(moduleName, { paths: [packageRoot] });
    const loadedPlugin: unknown = require(modulePath);
    const plugin = unwrapDefaultExport(loadedPlugin);

    if (!isAcceptedPostCssPlugin(plugin)) {
      throw new Error(
        `PostCSS plugin module must export a plugin: ${moduleName}`
      );
    }

    plugins.push(plugin);
  }

  return plugins;
}

async function convertInputFile(
  inputPath: string,
  options: ParsedArguments
): Promise<void> {
  const packageRoot = findPackageRoot(inputPath);
  const configPath =
    options.config !== undefined
      ? resolve(options.config)
      : findTailwindConfig(inputPath);
  const tailwindConfig = configPath
    ? loadTailwindConfig(configPath)
    : undefined;
  const postCSSPlugins = loadPostCssPlugins(
    options['postcss-plugin'],
    packageRoot
  );
  const converter = new TailwindConverter({
    remInPx: options['rem-in-px'],
    tailwindConfig,
    postCSSPlugins,
    arbitraryPropertiesIsEnabled: options['arbitrary-properties-is-enabled'],
    arbitraryVariants: options['arbitrary-variants'],
    strict: options.strict,
  });

  const css = await fileSystem.readFile(inputPath, 'utf8');
  const { convertedRoot } = await converter.convertCSS(css);

  await fileSystem.writeFile(inputPath, convertedRoot.toString(), 'utf8');
  process.stdout.write(`Updated ${relative(process.cwd(), inputPath)}\n`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  if (options._.length === 0) {
    throw new Error(
      'Provide one or more CSS glob patterns. Use --help for usage.'
    );
  }

  const inputPaths = await fg(options._, {
    absolute: true,
    onlyFiles: true,
    unique: true,
  });

  if (inputPaths.length === 0) {
    throw new Error('No files matched the supplied glob patterns.');
  }

  await Promise.all(
    inputPaths.map(async inputPath => {
      try {
        await convertInputFile(inputPath, options);
      } catch (error: unknown) {
        process.stderr.write(
          'Failed to convert ' +
            relative(process.cwd(), inputPath) +
            ': ' +
            errorMessage(error) +
            '\n'
        );
        process.exitCode = 1;
      }
    })
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`Error: ${errorMessage(error)}\n`);
  process.exitCode = 1;
});
