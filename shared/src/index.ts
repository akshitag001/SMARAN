export * from './types';
export * from './themes';
export * from './localDrafter';
export * from './tone';
export * from './dates';

export const STATE_LABEL = {
  done: 'Done',
  partly: 'Partly done',
  notyet: 'Not yet',
  pending: 'To check',
} as const;

/** "Smt. Kavita Yadav" → "Kavita Yadav" */
export function withoutHonorific(name: string): string {
  return name.replace(/^(Smt\.|Shri|Km\.|Dr\.)\s+/, '');
}

/** "Smt. Kavita Yadav" → "Kavita" */
export function firstName(name: string): string {
  return withoutHonorific(name).split(' ')[0];
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}
