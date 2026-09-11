import { describe, expect, test } from 'bun:test';

import {
  componentProblems,
  componentStep,
  groupComponents,
  nextComponentTotal,
  scaleComponentLines,
  type ComponentLine,
} from './dish-components';

/**
 * The cases here are the ones from the remediation plan's Milestone 3 table:
 * a chicken-and-rice plate whose parts move separately, and a مجدرة that does
 * not come apart.
 */

let order = 0;

function line(
  name: string,
  quantityGrams: number,
  extra: Partial<ComponentLine> = {},
): ComponentLine {
  return {
    componentKey: null,
    componentNameAr: null,
    componentNameEn: null,
    isPrimary: false,
    quantityGrams,
    sortOrder: order++,
    food: { id: name, nameAr: name, nameEn: name },
    ...extra,
  };
}

function grouped(
  name: string,
  quantityGrams: number,
  key: string,
  extra: Partial<ComponentLine> = {},
): ComponentLine {
  return line(name, quantityGrams, {
    componentKey: key,
    componentNameAr: 'مجدرة',
    componentNameEn: 'Mujaddara',
    isPrimary: true,
    ...extra,
  });
}

describe('what a plate is made of', () => {
  test('an assembled plate is one component per line', () => {
    // Chicken, rice and salad arrive in separate spoonfuls; each moves alone.
    const components = groupComponents([
      line('chicken', 150, { isPrimary: true }),
      line('rice', 150, { isPrimary: true }),
      line('salad', 100),
    ]);

    expect(components).toHaveLength(3);
    expect(components.every((one) => !one.grouped)).toBe(true);
    expect(components.map((one) => one.adjustable)).toEqual([true, true, false]);
  });

  test('a solo component is named by its food, not by a second copy of it', () => {
    const [component] = groupComponents([line('chicken', 150, { isPrimary: true })]);

    expect(component!.nameAr).toBe('chicken');
    expect(component!.key).toBe('food:chicken');
  });

  test('lines cooked together become one component with one name', () => {
    const components = groupComponents([
      grouped('rice', 150, 'mujaddara'),
      grouped('lentils', 198, 'mujaddara'),
      grouped('onion', 50, 'mujaddara'),
      grouped('oil', 12, 'mujaddara'),
      line('egg', 100, { isPrimary: true }),
    ]);

    expect(components).toHaveLength(2);

    const [dish, egg] = components;
    expect(dish!.grouped).toBe(true);
    expect(dish!.nameAr).toBe('مجدرة');
    expect(dish!.totalGrams).toBe(410);
    expect(dish!.lines).toHaveLength(4);

    // The egg is served beside it, so it keeps its own control.
    expect(egg!.grouped).toBe(false);
    expect(egg!.adjustable).toBe(true);
  });

  test('a component sits where its first line does', () => {
    order = 0;
    const components = groupComponents([
      line('bread', 90, { isPrimary: true }),
      grouped('rice', 150, 'mujaddara'),
      grouped('lentils', 198, 'mujaddara'),
    ]);

    expect(components.map((one) => one.nameEn)).toEqual(['bread', 'Mujaddara']);
  });
});

describe('moving a grouped component', () => {
  const component = groupComponents([
    grouped('rice', 150, 'mujaddara'),
    grouped('lentils', 200, 'mujaddara'),
    grouped('oil', 50, 'mujaddara'),
  ])[0]!;

  test('every line moves by the same ratio, so the recipe survives', () => {
    const scaled = scaleComponentLines(component, 800);

    // 400 g of recipe doubled: the 3:4:1 ratio is untouched.
    expect(scaled.map((one) => one.quantityGrams)).toEqual([300, 400, 100]);
  });

  test('a scaled line is grams, never a count', () => {
    // «٦ ملاعق أرز» describes the pot, not the plate: the client is served
    // مجدرة, so the unit belongs to the component and not to the rice in it.
    for (const one of scaleComponentLines(component, 600)) {
      expect(one.portionId).toBeNull();
      expect(one.portionQuantity).toBeNull();
    }
  });

  test('the step is a tenth of the serving, rounded to something readable', () => {
    expect(componentStep(400)).toBe(40);
    expect(componentStep(410)).toBe(40);
    expect(componentStep(155)).toBe(15);
  });

  test('a tiny component still moves by a usable amount', () => {
    expect(componentStep(30)).toBe(10);
  });

  test('the recipe amount is on the grid, so a press can always be undone', () => {
    const up = nextComponentTotal(400, 400, 1);
    expect(up).toBe(440);
    expect(nextComponentTotal(up, 400, -1)).toBe(400);
  });

  test('pressing down cannot empty the component', () => {
    let total = 400;
    for (let press = 0; press < 20; press += 1) {
      total = nextComponentTotal(total, 400, -1);
    }

    expect(total).toBe(40);
  });
});

describe('what an author may write', () => {
  test('a sound grouping has nothing to say', () => {
    expect(
      componentProblems([
        grouped('rice', 150, 'mujaddara'),
        grouped('lentils', 198, 'mujaddara'),
        line('egg', 100, { isPrimary: true }),
      ]),
    ).toEqual([]);
  });

  test('a group with no name has no way to describe itself', () => {
    const problems = componentProblems([
      grouped('rice', 150, 'm', { componentNameAr: '', componentNameEn: '' }),
    ]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('needs an Arabic and an English name');
  });

  test('lines of one component may not disagree about its name', () => {
    const problems = componentProblems([
      grouped('rice', 150, 'm'),
      grouped('lentils', 198, 'm', { componentNameAr: 'مجدّرة' }),
    ]);

    expect(problems.join(' ')).toContain('disagree on the Arabic name');
  });

  test('half a component cannot be adjustable', () => {
    // The control moves every line it holds, so there is no coherent meaning
    // for a group where only some lines carry one.
    const problems = componentProblems([
      grouped('rice', 150, 'm'),
      grouped('lentils', 198, 'm', { isPrimary: false }),
    ]);

    expect(problems.join(' ')).toContain('some lines are adjustable and some are not');
  });

  test('a name with no key is a grouping that never happened', () => {
    const problems = componentProblems([
      line('rice', 150, { componentNameAr: 'مجدرة', componentNameEn: 'Mujaddara' }),
    ]);

    expect(problems.join(' ')).toContain('component name but no component key');
  });
});
