import postcss, { AcceptedPlugin, Declaration, Processor, Root } from 'postcss';
import tailwindcss, { Config } from 'tailwindcss';

import { TailwindConverter } from '../../src/TailwindConverter';

type ConvertResult = Awaited<ReturnType<TailwindConverter['convertCSS']>>;

const processors = new Map<string, Processor>();

function getProcessor(tailwindConfig: Partial<Config> = {}) {
  const key = JSON.stringify(tailwindConfig);
  let processor = processors.get(key);

  if (!processor) {
    processor = postcss([
      tailwindcss({
        ...tailwindConfig,
        content: [{ raw: 'x', extension: 'html' }],
        corePlugins: {
          ...((tailwindConfig.corePlugins as Record<string, boolean>) || {}),
          preflight: false,
        },
      } as Config) as AcceptedPlugin,
    ]);
    processors.set(key, processor);
  }

  return processor;
}

/**
 * Compiles CSS with `@apply` by Tailwind, throws if any class doesn't exist.
 */
export async function compileOutput(
  css: string,
  tailwindConfig: Partial<Config> = {}
): Promise<Root> {
  const result = await getProcessor(tailwindConfig).process(css, {
    from: undefined,
  });

  return result.root;
}

/**
 * Returns the declarations (without `--tw-*` variables) generated for `.x` by the classes.
 */
export async function classDeclarations(
  classes: string | string[],
  tailwindConfig: Partial<Config> = {}
) {
  const root = await compileOutput(
    `.x { @apply ${Array.isArray(classes) ? classes.join(' ') : classes}; }`,
    tailwindConfig
  );
  const declarations: Record<string, string> = {};

  root.walkDecls((declaration: Declaration) => {
    if (!declaration.prop.startsWith('--tw-')) {
      declarations[declaration.prop] = declaration.value;
    }
  });

  return declarations;
}

export function collectClasses(result: ConvertResult) {
  const classes: string[] = [];

  result.nodes.forEach(node => classes.push(...node.tailwindClasses));

  return classes;
}

/**
 * Checks that every class of the conversion result exists (one by one to name the invalid one)
 * and that the whole converted CSS compiles.
 */
export async function expectValidConversion(
  result: ConvertResult,
  tailwindConfig: Partial<Config> = {}
) {
  for (const className of collectClasses(result)) {
    await expect(
      compileOutput(`.x { @apply ${className}; }`, tailwindConfig).then(
        () => className
      )
    ).resolves.toBe(className);
  }

  await compileOutput(result.convertedRoot.toString(), tailwindConfig);
}
