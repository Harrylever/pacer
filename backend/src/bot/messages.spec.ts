import { explorerAddress, explorerTx } from './messages';

describe('explorer links', () => {
  it('default to the devnet cluster', () => {
    expect(explorerTx('abc')).toBe(
      'https://explorer.solana.com/tx/abc?cluster=devnet',
    );
    expect(explorerAddress('Owner1')).toBe(
      'https://explorer.solana.com/address/Owner1?cluster=devnet',
    );
  });
});
