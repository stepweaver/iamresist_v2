import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { THEME_INIT_SCRIPT } from '@/lib/theme/themeInitScript';

function appliedClasses(cookie: string) {
  const classes = new Set<string>();
  const document = {
    cookie,
    documentElement: {
      classList: {
        add(name: string) {
          classes.add(name);
        },
      },
    },
  };
  vm.runInNewContext(THEME_INIT_SCRIPT, { document });
  return classes;
}

describe('theme init script', () => {
  it('adds the light class only for the theme cookie', () => {
    expect(appliedClasses('theme=light').has('light')).toBe(true);
    expect(appliedClasses('theme=dark').has('light')).toBe(false);
    expect(appliedClasses('').has('light')).toBe(false);
    expect(appliedClasses('other=theme=light').has('light')).toBe(false);
    expect(appliedClasses('session=abc; theme=light').has('light')).toBe(true);
  });
});
