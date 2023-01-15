import { reduceTailwindClasses } from '../src/utils/reduceTailwindClasses';

describe('reduceTailwindClasses()', () => {
  /* margin */
  test('reduce tailwind margin classes', () => {
    expect(
      reduceTailwindClasses([
        'foo',
        'ml-13',
        'bar',
        'md-18',
        'mr-13',
        'mt-13',
        'mb-13',
        'mx1',
      ])
    ).toEqual(['foo', 'bar', 'md-18', 'mx1', 'm-13']);

    expect(
      reduceTailwindClasses([
        'foo',
        'hover:ml-13',
        'bar',
        'ml-[123px]',
        'md-18',
        'mr-[123px]',
        'mt-13',
        'mb-13',
        'mx1',
      ])
    ).toEqual([
      'foo',
      'hover:ml-13',
      'bar',
      'md-18',
      'mx1',
      'mx-[123px]',
      'my-13',
    ]);

    expect(
      reduceTailwindClasses([
        'foo',
        'ml-13',
        'bar',
        'md-18',
        'mr-13',
        'm-3',
        'mt-13',
        'mb-13',
        'mx1',
      ])
    ).toEqual(['foo', 'bar', 'md-18', 'mx1', 'm-13', 'm-3']);

    expect(
      reduceTailwindClasses([
        'foo',
        '-ml-3',
        '-mr-3',
        'bar',
        'md-18',
        '-mt-3',
        '-mb-3',
        'mx1',
      ])
    ).toEqual(['foo', 'bar', 'md-18', 'mx1', '-m-3']);

    expect(
      reduceTailwindClasses([
        'foo',
        'ml-3',
        'mr-3',
        '-mt-12',
        'bar',
        'md-18',
        '-mb-12',
        'mx1',
      ])
    ).toEqual(['foo', 'bar', 'md-18', 'mx1', 'mx-3', '-my-12']);

    expect(
      reduceTailwindClasses([
        'foo',
        'ml-3',
        'mr-3',
        '-mt-12',
        'bar',
        'md-18',
        'mb-12',
        'mx1',
      ])
    ).toEqual(['foo', 'bar', 'md-18', 'mx1', '-mt-12', 'mb-12', 'mx-3']);

    expect(
      reduceTailwindClasses([
        'foo',
        'ml-3',
        '-mr-3',
        'bar',
        'md-18',
        '-mt-12',
        'mb-12',
        'mx1',
      ])
    ).toEqual([
      'foo',
      'bar',
      'md-18',
      'mx1',
      'ml-3',
      '-mr-3',
      '-mt-12',
      'mb-12',
    ]);

    expect(
      reduceTailwindClasses(['foo', 'mx-12', 'bar', 'md-18', 'my-12', 'mx1'])
    ).toEqual(['foo', 'bar', 'md-18', 'mx1', 'm-12']);

    expect(
      reduceTailwindClasses(['foo', 'mx-36', 'bar', 'md-18', '-my-12', 'mx1'])
    ).toEqual(['foo', 'bar', 'md-18', 'mx1', 'mx-36', '-my-12']);

    expect(
      reduceTailwindClasses([
        'foo',
        'ml-13',
        'bar',
        'md-18',
        'mx-13',
        'm-3',
        'mt-13',
        'my-13',
        'mb-13',
        'mx1',
      ])
    ).toEqual(['foo', 'bar', 'md-18', 'mx1', 'm-13', 'm-3']);

    expect(
      reduceTailwindClasses([
        'foo',
        'ml-13',
        'bar',
        'md-18',
        'mx-15',
        'm-3',
        'mt-13',
        'my-15',
        'mb-13',
        'mx1',
      ])
    ).toEqual(['foo', 'bar', 'md-18', 'mx1', 'ml-13', 'my-13', 'm-15', 'm-3']);
  });

  /* padding */
  test('reduce tailwind padding classes', () => {
    expect(
      reduceTailwindClasses([
        'foo',
        'pl-13',
        'bar',
        'pd-15',
        'pr-13',
        'pt-13',
        'pb-13',
        'px10',
      ])
    ).toEqual(['foo', 'bar', 'pd-15', 'px10', 'p-13']);

    expect(
      reduceTailwindClasses([
        'foo',
        'pl-13',
        'bar',
        'pd-15',
        'pr-13',
        'p-3',
        'pt-13',
        'pb-13',
        'px10',
      ])
    ).toEqual(['foo', 'bar', 'pd-15', 'px10', 'p-13', 'p-3']);

    expect(
      reduceTailwindClasses([
        'foo',
        '-pl-3',
        '-pr-3',
        'bar',
        'pd-15',
        '-pt-3',
        '-pb-3',
        'px10',
      ])
    ).toEqual(['foo', 'bar', 'pd-15', 'px10', '-p-3']);

    expect(
      reduceTailwindClasses([
        'foo',
        'pl-3',
        'pr-3',
        '-pt-12',
        'bar',
        'pd-15',
        '-pb-12',
        'px10',
      ])
    ).toEqual(['foo', 'bar', 'pd-15', 'px10', 'px-3', '-py-12']);

    expect(
      reduceTailwindClasses([
        'foo',
        'pl-3',
        'pr-3',
        '-pt-12',
        'bar',
        'pd-15',
        'pb-12',
        'px10',
      ])
    ).toEqual(['foo', 'bar', 'pd-15', 'px10', '-pt-12', 'pb-12', 'px-3']);

    expect(
      reduceTailwindClasses([
        'foo',
        'pl-3',
        '-pr-3',
        'bar',
        'pd-15',
        '-pt-12',
        'pb-12',
        'px10',
      ])
    ).toEqual([
      'foo',
      'bar',
      'pd-15',
      'px10',
      'pl-3',
      '-pr-3',
      '-pt-12',
      'pb-12',
    ]);

    expect(
      reduceTailwindClasses(['foo', 'px-12', 'bar', 'pd-15', 'py-12', 'px10'])
    ).toEqual(['foo', 'bar', 'pd-15', 'px10', 'p-12']);

    expect(
      reduceTailwindClasses(['foo', 'px-36', 'bar', 'pd-15', '-py-12', 'px10'])
    ).toEqual(['foo', 'bar', 'pd-15', 'px10', 'px-36', '-py-12']);

    expect(
      reduceTailwindClasses([
        'foo',
        'pl-13',
        'bar',
        'pd-15',
        'px-13',
        'p-3',
        'pt-13',
        'py-13',
        'pb-13',
        'px10',
      ])
    ).toEqual(['foo', 'bar', 'pd-15', 'px10', 'p-13', 'p-3']);

    expect(
      reduceTailwindClasses([
        'foo',
        'pl-13',
        'bar',
        'pd-15',
        'px-15',
        'p-3',
        'pt-13',
        'py-15',
        'pb-13',
        'px10',
      ])
    ).toEqual(['foo', 'bar', 'pd-15', 'px10', 'pl-13', 'py-13', 'p-15', 'p-3']);
  });

  /* border */
  test('reduce tailwind border classes', () => {
    expect(
      reduceTailwindClasses([
        'foo',
        'border-l-13',
        'bar',
        'border-d-18',
        'border-r-13',
        'border-t-13',
        'border-b-13',
        'border-x1',
      ])
    ).toEqual(['foo', 'bar', 'border-d-18', 'border-13', 'border-x1']);

    expect(
      reduceTailwindClasses([
        'foo',
        'border-l-13',
        'bar',
        'border-d-18',
        'border-r-13',
        'border-3',
        'border-t-13',
        'border-x1',
        'border-b-13',
      ])
    ).toEqual([
      'foo',
      'bar',
      'border-d-18',
      'border-13',
      'border-3',
      'border-x1',
    ]);

    expect(
      reduceTailwindClasses([
        'foo',
        '-border-l-3',
        '-border-r-3',
        'bar',
        'border-d-18',
        '-border-t-3',
        '-border-b-3',
        'border-x1',
      ])
    ).toEqual(['foo', 'bar', 'border-d-18', '-border-3', 'border-x1']);

    expect(
      reduceTailwindClasses([
        'foo',
        'border-l-3',
        'border-r-3',
        '-border-t-12',
        'bar',
        'border-d-18',
        'border-x1',
        '-border-b-12',
      ])
    ).toEqual([
      'foo',
      'bar',
      'border-d-18',
      'border-x-3',
      '-border-y-12',
      'border-x1',
    ]);

    expect(
      reduceTailwindClasses([
        'foo',
        'border-l-3',
        'border-r-3',
        '-border-t-12',
        'bar',
        'border-d-18',
        'border-b-12',
        'border-x1',
      ])
    ).toEqual([
      'foo',
      'bar',
      'border-d-18',
      '-border-t-12',
      'border-b-12',
      'border-x-3',
      'border-x1',
    ]);

    expect(
      reduceTailwindClasses([
        'foo',
        'border-l-3',
        '-border-r-3',
        'bar',
        'border-d-18',
        '-border-t-12',
        'border-b-12',
        'border-x1',
      ])
    ).toEqual([
      'foo',
      'bar',
      'border-d-18',
      'border-l-3',
      '-border-r-3',
      '-border-t-12',
      'border-b-12',
      'border-x1',
    ]);

    expect(
      reduceTailwindClasses([
        'foo',
        'border-x-12',
        'bar',
        'border-d-18',
        'border-y-12',
        'border-x1',
      ])
    ).toEqual(['foo', 'bar', 'border-d-18', 'border-12', 'border-x1']);

    expect(
      reduceTailwindClasses([
        'foo',
        'border-x-36',
        'bar',
        'border-d-18',
        '-border-y-12',
        'border-x1',
      ])
    ).toEqual([
      'foo',
      'bar',
      'border-d-18',
      'border-x-36',
      '-border-y-12',
      'border-x1',
    ]);

    expect(
      reduceTailwindClasses([
        'foo',
        'border-l-13',
        'bar',
        'border-d-18',
        'border-x-13',
        'border-3',
        'border-t-13',
        'border-y-13',
        'border-b-13',
        'border-x1',
      ])
    ).toEqual([
      'foo',
      'bar',
      'border-d-18',
      'border-13',
      'border-3',
      'border-x1',
    ]);

    expect(
      reduceTailwindClasses([
        'foo',
        'border-l-13',
        'bar',
        'border-d-18',
        'border-x-15',
        'border-3',
        'border-t-13',
        'border-y-15',
        'border-b-13',
        'border-x1',
      ])
    ).toEqual([
      'foo',
      'bar',
      'border-d-18',
      'border-l-13',
      'border-y-13',
      'border-15',
      'border-3',
      'border-x1',
    ]);
  });

  /* position */
  test('reduce tailwind position classes', () => {
    expect(
      reduceTailwindClasses([
        'foo',
        'left-13',
        'bar',
        'inset-d-18',
        'right-13',
        'top-13',
        'bottom-13',
        'inset-x1',
      ])
    ).toEqual(['foo', 'bar', 'inset-d-18', 'inset-13', 'inset-x1']);

    expect(
      reduceTailwindClasses([
        'foo',
        'left-13',
        'bar',
        'inset-d-18',
        'right-13',
        'inset-3',
        'top-13',
        'inset-x1',
        'bottom-13',
      ])
    ).toEqual(['foo', 'bar', 'inset-d-18', 'inset-13', 'inset-3', 'inset-x1']);

    expect(
      reduceTailwindClasses([
        'foo',
        '-left-3',
        '-right-3',
        'bar',
        'inset-d-18',
        '-top-3',
        '-bottom-3',
        'inset-x1',
      ])
    ).toEqual(['foo', 'bar', 'inset-d-18', '-inset-3', 'inset-x1']);

    expect(
      reduceTailwindClasses([
        'foo',
        'left-3',
        'right-3',
        '-top-12',
        'bar',
        'inset-d-18',
        'inset-x1',
        '-bottom-12',
      ])
    ).toEqual([
      'foo',
      'bar',
      'inset-d-18',
      'inset-x-3',
      '-inset-y-12',
      'inset-x1',
    ]);

    expect(
      reduceTailwindClasses([
        'foo',
        'left-3',
        'right-3',
        '-top-12',
        'bar',
        'inset-d-18',
        'bottom-12',
        'inset-x1',
      ])
    ).toEqual([
      'foo',
      'bar',
      'inset-d-18',
      '-top-12',
      'bottom-12',
      'inset-x-3',
      'inset-x1',
    ]);

    expect(
      reduceTailwindClasses([
        'foo',
        'left-3',
        '-right-3',
        'bar',
        'inset-d-18',
        '-top-12',
        'bottom-12',
        'inset-x1',
      ])
    ).toEqual([
      'foo',
      'bar',
      'inset-d-18',
      'left-3',
      '-right-3',
      '-top-12',
      'bottom-12',
      'inset-x1',
    ]);

    expect(
      reduceTailwindClasses([
        'foo',
        'inset-x-12',
        'bar',
        'inset-d-18',
        'inset-y-12',
        'inset-x1',
      ])
    ).toEqual(['foo', 'bar', 'inset-d-18', 'inset-12', 'inset-x1']);

    expect(
      reduceTailwindClasses([
        'foo',
        'inset-x-36',
        'bar',
        'inset-d-18',
        '-inset-y-12',
        'inset-x1',
      ])
    ).toEqual([
      'foo',
      'bar',
      'inset-d-18',
      'inset-x-36',
      '-inset-y-12',
      'inset-x1',
    ]);

    expect(
      reduceTailwindClasses([
        'foo',
        'left-13',
        'bar',
        'inset-d-18',
        'inset-x-13',
        'inset-3',
        'top-13',
        'inset-y-13',
        'bottom-13',
        'inset-x1',
      ])
    ).toEqual(['foo', 'bar', 'inset-d-18', 'inset-13', 'inset-3', 'inset-x1']);

    expect(
      reduceTailwindClasses([
        'foo',
        'left-13',
        'bar',
        'inset-d-18',
        'inset-x-15',
        'inset-3',
        'top-13',
        'inset-y-15',
        'bottom-13',
        'inset-x1',
      ])
    ).toEqual([
      'foo',
      'bar',
      'inset-d-18',
      'left-13',
      'inset-y-13',
      'inset-15',
      'inset-3',
      'inset-x1',
    ]);
  });

  test('reduce tailwind mixed classes', () => {
    expect(
      reduceTailwindClasses([
        'foo',
        '-pl-3',
        'left-13',
        'pb-15',
        'border-l-13',
        'border-3',
        'bar',
        'inset-d-18',
        'border-d-18',
        '-pt-3',
        'border-x-15',
        'inset-x-15',
        'inset-3',
        'top-13',
        'inset-y-15',
        'border-t-13',
        'border-y-15',
        '-pr-3',
        'border-b-13',
        'border-x1',
        'bottom-13',
        'inset-x1',
      ])
    ).toEqual([
      'foo',
      'bar',
      'inset-d-18',
      'border-d-18',
      '-pt-3',
      'pb-15',
      '-px-3',
      'border-l-13',
      'border-y-13',
      'border-3',
      'border-15',
      'border-x1',
      'left-13',
      'inset-y-13',
      'inset-15',
      'inset-3',
      'inset-x1',
    ]);
  });
});
