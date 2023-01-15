import { Root, Document, Rule, AtRule, RuleProps } from 'postcss';
import { TailwindNodesManager } from '../src/TailwindNodesManager';

function createSimpleRule(props?: RuleProps) {
  return new Rule({
    selector: '.alert[data-test="hello"] > .foo:hover',
    ...props,
  });
}

function createNestedRule(props?: RuleProps) {
  const rule = createSimpleRule(props);

  new Document().append(
    new Root().append(
      new AtRule({
        name: 'media',
        params: 'screen',
      }).append(
        new AtRule({
          name: 'supports',
          params: '(display: flex)',
          nodes: [],
        }).append(
          new Rule({
            selector: '.foobar[data-enabled="yes"]:hover',
          }),
          new AtRule({
            name: 'media',
            params: '(min-width: 768px) and (max-width: 1024px)',
          }).append(
            new Rule({
              selector: '.barbaz > .ok',
            }).append(
              new AtRule({
                name: 'supports',
                params: '(display: grid)',
              }).append(rule)
            )
          )
        )
      )
    )
  );

  return rule;
}

function createBaseTailwindNodesManager() {
  return new TailwindNodesManager([
    {
      rule: createSimpleRule({ selector: '.alert' }),
      tailwindClasses: ['mt-20', 'mb-20', 'ml-20', 'mr-20'],
    },
    {
      key: '.alert',
      fallbackRule: createSimpleRule({ selector: '.alert[data-test="hello"]' }),
      classesPrefixWhenFound: 'data-hello:',
      tailwindClasses: ['pt-4', 'font-bold', 'text-center'],
    },
    {
      rule: createSimpleRule({ selector: '.alert' }),
      tailwindClasses: ['text-left', 'text-blue-500', 'align-middle'],
    },
    {
      key: '.alert[data-test="hello"]',
      fallbackRule: createSimpleRule({
        selector: '.alert[data-test="hello"]:hover',
      }),
      classesPrefixWhenFound: 'dh-hover:',
      tailwindClasses: ['foo-bar', 'baz'],
    },
    {
      rule: createNestedRule({
        selector: '.alert > .foobar-baz:focus:hover::after',
      }),
      tailwindClasses: ['bg-red', 'text-left', 'flex-none'],
    },
  ]);
}

describe('TailwindNodesManager', () => {
  describe('TailwindNodesManager.convertRuleToKey', () => {
    test('convert simple rule to key', () => {
      expect(
        TailwindNodesManager.convertRuleToKey(
          createSimpleRule({
            selector: '.alert[data-test="hello"] > .foo:hover',
          })
        )
      ).toEqual('.alert[data-test="hello"] > .foo:hover');
    });

    test('convert nested rule to key', () => {
      expect(
        TailwindNodesManager.convertRuleToKey(
          createNestedRule({
            selector: '.alert[data-test="hello"] > .foo:hover',
          })
        )
      ).toEqual(
        'a(supports|(display: grid))__r(.barbaz > .ok)__a(media|(min-width: 768px) and (max-width: 1024px))__a(supports|(display: flex))__a(media|screen)__.alert[data-test="hello"] > .foo:hover'
      );
    });
  });

  describe('TailwindNodesManager.hasNode', () => {
    test('check node with simple rule to existence by key', () => {
      const nodesManager = createBaseTailwindNodesManager();

      expect(nodesManager.hasNode('.alert')).toEqual(true);

      expect(
        nodesManager.hasNode('.alert > .foobar-baz:focus:hover::after')
      ).toEqual(false);
    });

    test('check node with nested rule to existence by key', () => {
      const nodesManager = createBaseTailwindNodesManager();

      expect(
        nodesManager.hasNode(
          TailwindNodesManager.convertRuleToKey(
            createNestedRule({ selector: '.alert' })
          )
        )
      ).toEqual(false);

      expect(
        nodesManager.hasNode(
          TailwindNodesManager.convertRuleToKey(
            createNestedRule({
              selector: '.alert > .foobar-baz:focus:hover::after',
            })
          )
        )
      ).toEqual(true);
    });
  });

  describe('TailwindNodesManager.getNode', () => {
    test('get node with simple rule by key', () => {
      const nodesManager = createBaseTailwindNodesManager();

      expect(nodesManager.getNode('.alert')).toEqual(
        expect.objectContaining({
          rule: expect.objectContaining({ selector: '.alert' }),
          tailwindClasses: [
            'mt-20',
            'mb-20',
            'ml-20',
            'mr-20',
            'data-hello:pt-4',
            'data-hello:font-bold',
            'data-hello:text-center',
            'text-left',
            'text-blue-500',
            'align-middle',
          ],
        })
      );

      expect(
        nodesManager.getNode('.alert > .foobar-baz:focus:hover::after')
      ).toEqual(null);
    });

    test('get node with nested rule by key', () => {
      const nodesManager = createBaseTailwindNodesManager();
      expect(
        nodesManager.getNode(
          TailwindNodesManager.convertRuleToKey(
            createNestedRule({
              selector: '.alert > .foobar-baz:focus:hover::after',
            })
          )
        )
      ).toEqual(
        expect.objectContaining({
          rule: expect.objectContaining({
            selector: '.alert > .foobar-baz:focus:hover::after',
          }),
          tailwindClasses: ['bg-red', 'text-left', 'flex-none'],
        })
      );

      expect(
        nodesManager.getNode(
          TailwindNodesManager.convertRuleToKey(
            createNestedRule({ selector: '.alert' })
          )
        )
      ).toEqual(null);
    });
  });

  describe('TailwindNodesManager.getNodes', () => {
    test('get all nodes as array', () => {
      const nodesManager = createBaseTailwindNodesManager();

      expect(nodesManager.getNodes()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: expect.objectContaining({ selector: '.alert' }),
            tailwindClasses: [
              'mt-20',
              'mb-20',
              'ml-20',
              'mr-20',
              'data-hello:pt-4',
              'data-hello:font-bold',
              'data-hello:text-center',
              'text-left',
              'text-blue-500',
              'align-middle',
            ],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert[data-test="hello"]:hover',
            }),
            tailwindClasses: ['foo-bar', 'baz'],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert > .foobar-baz:focus:hover::after',
            }),
            tailwindClasses: ['bg-red', 'text-left', 'flex-none'],
          }),
        ])
      );
    });
  });

  describe('TailwindNodesManager.mergeNode', () => {
    test('merge resolved node with already existing simple rule', () => {
      const nodesManager = createBaseTailwindNodesManager();

      nodesManager.mergeNode({
        rule: createSimpleRule({ selector: '.alert[data-test="hello"]:hover' }),
        tailwindClasses: ['pt-12', 'border-dashed'],
      });

      expect(nodesManager.getNodes()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: expect.objectContaining({ selector: '.alert' }),
            tailwindClasses: [
              'mt-20',
              'mb-20',
              'ml-20',
              'mr-20',
              'data-hello:pt-4',
              'data-hello:font-bold',
              'data-hello:text-center',
              'text-left',
              'text-blue-500',
              'align-middle',
            ],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert[data-test="hello"]:hover',
            }),
            tailwindClasses: ['foo-bar', 'baz', 'pt-12', 'border-dashed'],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert > .foobar-baz:focus:hover::after',
            }),
            tailwindClasses: ['bg-red', 'text-left', 'flex-none'],
          }),
        ])
      );
    });

    test('merge resolved node with yet non-existent simple rule', () => {
      const nodesManager = createBaseTailwindNodesManager();

      nodesManager.mergeNode({
        rule: createSimpleRule({ selector: '.alert:hover' }),
        tailwindClasses: ['foo', 'bat:bar', 'baz'],
      });

      expect(nodesManager.getNodes()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: expect.objectContaining({ selector: '.alert' }),
            tailwindClasses: [
              'mt-20',
              'mb-20',
              'ml-20',
              'mr-20',
              'data-hello:pt-4',
              'data-hello:font-bold',
              'data-hello:text-center',
              'text-left',
              'text-blue-500',
              'align-middle',
            ],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert[data-test="hello"]:hover',
            }),
            tailwindClasses: ['foo-bar', 'baz'],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert > .foobar-baz:focus:hover::after',
            }),
            tailwindClasses: ['bg-red', 'text-left', 'flex-none'],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert:hover',
            }),
            tailwindClasses: ['foo', 'bat:bar', 'baz'],
          }),
        ])
      );
    });

    test('merge resolved node with already existing nested rule', () => {
      const nodesManager = createBaseTailwindNodesManager();

      nodesManager.mergeNode({
        rule: createNestedRule({
          selector: '.alert > .foobar-baz:focus:hover::after',
        }),
        tailwindClasses: ['foo', 'bat:bar', 'baz'],
      });

      expect(nodesManager.getNodes()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: expect.objectContaining({ selector: '.alert' }),
            tailwindClasses: [
              'mt-20',
              'mb-20',
              'ml-20',
              'mr-20',
              'data-hello:pt-4',
              'data-hello:font-bold',
              'data-hello:text-center',
              'text-left',
              'text-blue-500',
              'align-middle',
            ],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert[data-test="hello"]:hover',
            }),
            tailwindClasses: ['foo-bar', 'baz'],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert > .foobar-baz:focus:hover::after',
            }),
            tailwindClasses: [
              'bg-red',
              'text-left',
              'flex-none',
              'foo',
              'bat:bar',
              'baz',
            ],
          }),
        ])
      );
    });

    test('merge resolved node with yet non-existent nested rule', () => {
      const nodesManager = createBaseTailwindNodesManager();

      nodesManager.mergeNode({
        rule: createNestedRule({
          selector: '.alert',
        }),
        tailwindClasses: ['foo', 'bat:bar', 'baz'],
      });

      expect(nodesManager.getNodes()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: expect.objectContaining({ selector: '.alert' }),
            tailwindClasses: [
              'mt-20',
              'mb-20',
              'ml-20',
              'mr-20',
              'data-hello:pt-4',
              'data-hello:font-bold',
              'data-hello:text-center',
              'text-left',
              'text-blue-500',
              'align-middle',
            ],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert[data-test="hello"]:hover',
            }),
            tailwindClasses: ['foo-bar', 'baz'],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert > .foobar-baz:focus:hover::after',
            }),
            tailwindClasses: ['bg-red', 'text-left', 'flex-none'],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert',
            }),
            tailwindClasses: ['foo', 'bat:bar', 'baz'],
          }),
        ])
      );
    });

    test('merge unresolved node with already existing simple rule key', () => {
      const nodesManager = createBaseTailwindNodesManager();

      nodesManager.mergeNode({
        key: '.alert[data-test="hello"]:hover',
        fallbackRule: createSimpleRule({
          selector: '.alert > #some:focus ',
        }),
        classesPrefixWhenFound: 'some-[another]:',
        tailwindClasses: ['foo', 'bat:bar', 'baz'],
      });

      expect(nodesManager.getNodes()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: expect.objectContaining({ selector: '.alert' }),
            tailwindClasses: [
              'mt-20',
              'mb-20',
              'ml-20',
              'mr-20',
              'data-hello:pt-4',
              'data-hello:font-bold',
              'data-hello:text-center',
              'text-left',
              'text-blue-500',
              'align-middle',
            ],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert[data-test="hello"]:hover',
            }),
            tailwindClasses: [
              'foo-bar',
              'baz',
              'some-[another]:foo',
              'some-[another]:bat:bar',
              'some-[another]:baz',
            ],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert > .foobar-baz:focus:hover::after',
            }),
            tailwindClasses: ['bg-red', 'text-left', 'flex-none'],
          }),
        ])
      );
    });

    test('merge unresolved node with yet non-existent simple rule key', () => {
      const nodesManager = createBaseTailwindNodesManager();

      nodesManager.mergeNode({
        key: '.alert > #some:focus',
        fallbackRule: createSimpleRule({
          selector: '.alert > #foobar:hover',
        }),
        classesPrefixWhenFound: 'foo-bar:test:',
        tailwindClasses: ['foo', 'bat:bar', 'baz'],
      });

      expect(nodesManager.getNodes()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: expect.objectContaining({ selector: '.alert' }),
            tailwindClasses: [
              'mt-20',
              'mb-20',
              'ml-20',
              'mr-20',
              'data-hello:pt-4',
              'data-hello:font-bold',
              'data-hello:text-center',
              'text-left',
              'text-blue-500',
              'align-middle',
            ],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert[data-test="hello"]:hover',
            }),
            tailwindClasses: ['foo-bar', 'baz'],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert > .foobar-baz:focus:hover::after',
            }),
            tailwindClasses: ['bg-red', 'text-left', 'flex-none'],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert > #foobar:hover',
            }),
            tailwindClasses: ['foo', 'bat:bar', 'baz'],
          }),
        ])
      );
    });

    test('merge unresolved node with already existing nested rule key', () => {
      const nodesManager = createBaseTailwindNodesManager();

      nodesManager.mergeNode({
        key: TailwindNodesManager.convertRuleToKey(
          createNestedRule({
            selector: '.alert > .foobar-baz:focus:hover::after',
          })
        ),
        fallbackRule: createSimpleRule({
          selector: '.alert > #foobar:hover',
        }),
        classesPrefixWhenFound: 'foo-bar:test:',
        tailwindClasses: ['foo', 'bat:bar', 'baz'],
      });

      expect(nodesManager.getNodes()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: expect.objectContaining({ selector: '.alert' }),
            tailwindClasses: [
              'mt-20',
              'mb-20',
              'ml-20',
              'mr-20',
              'data-hello:pt-4',
              'data-hello:font-bold',
              'data-hello:text-center',
              'text-left',
              'text-blue-500',
              'align-middle',
            ],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert[data-test="hello"]:hover',
            }),
            tailwindClasses: ['foo-bar', 'baz'],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert > .foobar-baz:focus:hover::after',
            }),
            tailwindClasses: [
              'bg-red',
              'text-left',
              'flex-none',
              'foo-bar:test:foo',
              'foo-bar:test:bat:bar',
              'foo-bar:test:baz',
            ],
          }),
        ])
      );
    });

    test('merge unresolved node with yet non-existent nested rule key', () => {
      const nodesManager = createBaseTailwindNodesManager();

      nodesManager.mergeNode({
        key: TailwindNodesManager.convertRuleToKey(
          createNestedRule({
            selector: '.alert',
          })
        ),
        fallbackRule: createSimpleRule({
          selector: '.alert > #foobar:hover',
        }),
        classesPrefixWhenFound: 'foo-bar:test:',
        tailwindClasses: ['foo', 'bat:bar', 'baz'],
      });

      expect(nodesManager.getNodes()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: expect.objectContaining({ selector: '.alert' }),
            tailwindClasses: [
              'mt-20',
              'mb-20',
              'ml-20',
              'mr-20',
              'data-hello:pt-4',
              'data-hello:font-bold',
              'data-hello:text-center',
              'text-left',
              'text-blue-500',
              'align-middle',
            ],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert[data-test="hello"]:hover',
            }),
            tailwindClasses: ['foo-bar', 'baz'],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert > .foobar-baz:focus:hover::after',
            }),
            tailwindClasses: ['bg-red', 'text-left', 'flex-none'],
          }),
          expect.objectContaining({
            rule: expect.objectContaining({
              selector: '.alert > #foobar:hover',
            }),
            tailwindClasses: ['foo', 'bat:bar', 'baz'],
          }),
        ])
      );
    });
  });
});
