import { parseDisplayCurrency } from './currency';

describe('parseDisplayCurrency', () => {
  it.each([
    'naira',
    'Naira',
    'NGN',
    'ngn',
    '₦',
    'nigerian naira',
    'in naira please',
  ])('reads %p as naira', (text) =>
    expect(parseDisplayCurrency(text)).toEqual({ kind: 'ok', currency: 'NGN' }),
  );

  it.each([
    'usd',
    'USD',
    'US dollars',
    'us dollar',
    'dollars',
    'dollar',
    '$',
    'american dollars',
  ])('reads %p as US dollars', (text) =>
    expect(parseDisplayCurrency(text)).toEqual({ kind: 'ok', currency: 'USD' }),
  );

  // The old matcher saved any message containing "dollar" as USD.
  it.each([
    ['CAD', 'Canadian dollar'],
    ['canadian dollars', 'Canadian dollar'],
    ['AUD', 'Australian dollar'],
    ['ZAR', 'South African rand'],
    ['rand', 'South African rand'],
    ['YEN', 'Japanese yen'],
    ['jpy', 'Japanese yen'],
    ['euro', 'euro'],
    ['EUR', 'euro'],
    ['GBP', 'British pound'],
    ['pounds', 'British pound'],
    ['cedis', 'Ghanaian cedi'],
    ['GHS', 'Ghanaian cedi'],
    ['KES', 'Kenyan shilling'],
    ['peso', 'peso'],
  ])('knows %p is not supported and names it', (text, name) =>
    expect(parseDisplayCurrency(text)).toEqual({ kind: 'unsupported', name }),
  );

  it.each(['', '   ', 'hello', 'what is this', '123', 'maybe later'])(
    'treats %p as unclear',
    (text) => expect(parseDisplayCurrency(text)).toEqual({ kind: 'unclear' }),
  );

  it('does not match currency codes inside other words', () => {
    // "cadence" contains "cad", "grandma" contains "rand"
    expect(parseDisplayCurrency('cadence')).toEqual({ kind: 'unclear' });
    expect(parseDisplayCurrency('grandma')).toEqual({ kind: 'unclear' });
  });

  it('prefers naira when someone mentions both', () => {
    expect(parseDisplayCurrency('naira, not dollars')).toEqual({
      kind: 'ok',
      currency: 'NGN',
    });
  });
});
