import { describe, expect, it } from 'vitest';
import {
  formatIssuedAndSanctionedTaskBudget,
  formatTaskBudgetAmount,
  isValidTaskBudgetAmount
} from './event-tasks.models';

describe('task rupee amounts', () => {
  it('accepts whole rupees and rejects fractional amounts', () => {
    expect(isValidTaskBudgetAmount('1200')).toBe(true);
    expect(isValidTaskBudgetAmount('0')).toBe(true);
    expect(isValidTaskBudgetAmount('1200.78')).toBe(false);
  });

  it('formats amounts without decimal places', () => {
    expect(formatTaskBudgetAmount('1200')).toBe('₹ 1,200');
    expect(formatTaskBudgetAmount('1200.78')).toBe('₹ 1,201');
  });

  it('shows issued amount against the sanctioned amount', () => {
    expect(formatIssuedAndSanctionedTaskBudget('8100', '142000')).toBe('₹ 8,100 / 1,42,000');
  });
});
