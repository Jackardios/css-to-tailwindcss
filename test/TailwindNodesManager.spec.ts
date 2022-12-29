import { TailwindNodesManager } from '../src/TailwindNodesManager';

function createBaseTailwindNodesManager() {
  return new TailwindNodesManager([
    {
      selector: '.alert',
      tailwindClasses: ['mt-20', 'mb-20', 'ml-20', 'mr-20'],
      skippedDeclarations: [],
    },
    {
      selector: '.alert[data-test="hello"]',
      tailwindClasses: ['pt-4', 'font-bold', 'text-center'],
      skippedDeclarations: [],
    },
    {
      selector: '.alert > .foobar-baz:hover:focus',
      tailwindClasses: ['text-left', 'text-blue-500', 'align-middle'],
      skippedDeclarations: [],
    },
  ]);
}

describe('TailwindNodesManager', () => {
  describe('TailwindNodesManager.getNodeIndexBySelector', () => {
    test('get node index by selector', () => {
      const nodes = createBaseTailwindNodesManager();

      expect(nodes.getNodeIndexBySelector('.alert[data-test="hello"]')).toEqual(
        1
      );
    });
  });

  describe('TailwindNodesManager.getNodeBySelector', () => {
    test('get node by selector', () => {
      const nodes = createBaseTailwindNodesManager();

      expect(nodes.getNodeBySelector('.alert[data-test="hello"]')).toEqual({
        selector: '.alert[data-test="hello"]',
        tailwindClasses: ['pt-4', 'font-bold', 'text-center'],
        skippedDeclarations: [],
      });
    });
  });

  describe('TailwindNodesManager.getNodes', () => {
    test('get all nodes', () => {
      const nodes = createBaseTailwindNodesManager();

      expect(nodes.getNodes()).toEqual([
        {
          selector: '.alert',
          tailwindClasses: ['mt-20', 'mb-20', 'ml-20', 'mr-20'],
          skippedDeclarations: [],
        },
        {
          selector: '.alert[data-test="hello"]',
          tailwindClasses: ['pt-4', 'font-bold', 'text-center'],
          skippedDeclarations: [],
        },
        {
          selector: '.alert > .foobar-baz:hover:focus',
          tailwindClasses: ['text-left', 'text-blue-500', 'align-middle'],
          skippedDeclarations: [],
        },
      ]);
    });
  });

  describe('TailwindNodesManager.mergeNode', () => {
    test('merge node', () => {
      const nodes = createBaseTailwindNodesManager();

      // new selector
      expect(
        nodes.mergeNode({
          selector: '.alert > .bar:hover:focus',
          tailwindClasses: ['pt-12', 'mb-20', 'bg-blue-500'],
        })
      ).toEqual({
        selector: '.alert > .bar:hover:focus',
        tailwindClasses: ['pt-12', 'mb-20', 'bg-blue-500'],
        skippedDeclarations: [],
      });

      // old selector
      expect(
        nodes.mergeNode({
          selector: '.alert > .foobar-baz:hover:focus',
          tailwindClasses: ['block', 'pt-12', 'text-left', 'bg-cover'],
        })
      ).toEqual({
        selector: '.alert > .foobar-baz:hover:focus',
        tailwindClasses: [
          'text-left',
          'text-blue-500',
          'align-middle',
          'block',
          'pt-12',
          'bg-cover',
        ],
        skippedDeclarations: [],
      });
    });
  });

  describe('TailwindNodesManager.mergeNodes', () => {
    test('merge nodes', () => {
      const nodes = createBaseTailwindNodesManager();

      nodes.mergeNodes([
        {
          selector: '.alert > .bar:hover:focus',
          tailwindClasses: ['pt-12', 'mb-20', 'bg-blue-500'],
        },
        {
          selector: '.alert > .foobar-baz:hover:focus',
          tailwindClasses: ['block', 'pt-12', 'text-left', 'bg-cover'],
        },
      ]);
      expect(nodes.getNodes()).toEqual([
        {
          selector: '.alert',
          tailwindClasses: ['mt-20', 'mb-20', 'ml-20', 'mr-20'],
          skippedDeclarations: [],
        },
        {
          selector: '.alert[data-test="hello"]',
          tailwindClasses: ['pt-4', 'font-bold', 'text-center'],
          skippedDeclarations: [],
        },
        {
          selector: '.alert > .foobar-baz:hover:focus',
          tailwindClasses: [
            'text-left',
            'text-blue-500',
            'align-middle',
            'block',
            'pt-12',
            'bg-cover',
          ],
          skippedDeclarations: [],
        },
        {
          selector: '.alert > .bar:hover:focus',
          tailwindClasses: ['pt-12', 'mb-20', 'bg-blue-500'],
          skippedDeclarations: [],
        },
      ]);
    });
  });

  describe('TailwindNodesManager.mergeNodesManager', () => {
    test('merge nodes', () => {
      const nodes = createBaseTailwindNodesManager();
      const mergeableNodesManager = new TailwindNodesManager([
        {
          selector: '.alert > .bar:hover:focus',
          tailwindClasses: ['pt-12', 'mb-20', 'bg-blue-500'],
          skippedDeclarations: [],
        },
        {
          selector: '.alert > .foobar-baz:hover:focus',
          tailwindClasses: ['block', 'pt-12', 'text-left', 'bg-cover'],
          skippedDeclarations: [],
        },
      ]);

      nodes.mergeNodesManager(mergeableNodesManager);
      expect(nodes.getNodes()).toEqual([
        {
          selector: '.alert',
          tailwindClasses: ['mt-20', 'mb-20', 'ml-20', 'mr-20'],
          skippedDeclarations: [],
        },
        {
          selector: '.alert[data-test="hello"]',
          tailwindClasses: ['pt-4', 'font-bold', 'text-center'],
          skippedDeclarations: [],
        },
        {
          selector: '.alert > .foobar-baz:hover:focus',
          tailwindClasses: [
            'text-left',
            'text-blue-500',
            'align-middle',
            'block',
            'pt-12',
            'bg-cover',
          ],
          skippedDeclarations: [],
        },
        {
          selector: '.alert > .bar:hover:focus',
          tailwindClasses: ['pt-12', 'mb-20', 'bg-blue-500'],
          skippedDeclarations: [],
        },
      ]);
    });
  });
});
