import { describe, expect, it } from 'vitest';
import { WholeRupeeDirective } from './whole-rupee.directive';

describe('WholeRupeeDirective', () => {
  it.each(['+', '-', '.', 'e', 'E'])('blocks the %s key', (key) => {
    const directive = new WholeRupeeDirective();
    const event = createKeyEvent(key);

    directive.onKeydown(event.event);

    expect(event.defaultPrevented()).toBe(true);
  });

  it('allows digits and common editing shortcuts', () => {
    const directive = new WholeRupeeDirective();
    const digitEvent = createKeyEvent('8');
    const shortcutEvent = createKeyEvent('v', true);

    directive.onKeydown(digitEvent.event);
    directive.onKeydown(shortcutEvent.event);

    expect(digitEvent.defaultPrevented()).toBe(false);
    expect(shortcutEvent.defaultPrevented()).toBe(false);
  });
});

function createKeyEvent(key: string, ctrlKey = false): {
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'preventDefault'>;
  defaultPrevented: () => boolean;
} {
  let isPrevented = false;
  return {
    event: {
      key,
      ctrlKey,
      metaKey: false,
      preventDefault: () => { isPrevented = true; }
    },
    defaultPrevented: () => isPrevented
  };
}
