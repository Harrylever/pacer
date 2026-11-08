# History data

These are monthly values from October 2021 to October 2026 (61 months), compiled on Nov 4, 2026. The app ships these files as they are and calls no live API during the demo.

## `us_stocks_monthly.csv`

Month-end closing prices for SPY (S&P 500 ETF), AAPL and NVDA.

- `*_close` is the raw closing price, adjusted for splits (NVDA's 10:1 split in June 2024).
- `*_adj_close` is also adjusted for dividends, as if every dividend were reinvested. **Use `adj_close` for comparisons.** xStocks pass dividends to holders by raising their ScaledUiAmount multiplier, so this column matches what a holder actually got.
- Source: Yahoo Finance chart API, monthly bars (`query1.finance.yahoo.com/v8/finance/chart/<SYM>?interval=1mo`).

## `ngn_usd_monthly.csv`

Naira per US dollar at each month-end.

| Column | Meaning |
| --- | --- |
| `ngn_per_usd` | **Use this one.** It's the parallel-market rate, which is what people actually paid. |
| `parallel_date` | The date of the quote. It's the last day of the month or the nearest reported day, at most a few days off. |
| `parallel_source` | The article each value comes from |
| `parallel_note` | Notes on the quote (selling rate, an average, a volatile month, and so on) |
| `official_cbn_ngn_per_usd` | The Central Bank of Nigeria's official central rate, for comparison |
| `parallel_premium_pct` | How far the parallel rate sat above the official one |

**Sources:**
- **Official rate:** the Central Bank of Nigeria (`cbn.gov.ng/api/GetAllExchangeRates`), the last published rate of each month.
- **Parallel rate:** pieced together from daily news reports, because no free dataset exists. Most values come from Nairametrics' daily black-market reports; the rest come from Investors King, Legit.ng, BusinessDay, Vanguard (via AllAfrica), Leadership, Arbiterz, TheCityCeleb and Techeconomy. Each row links its own article.

**Caveats to show next to the chart:**
- Parallel-market rates aren't official. They vary by dealer, city, whether it's a buy or sell quote, and time of day, typically by ₦5 to ₦20, and more in volatile weeks. Treat each value as accurate to within about 1 to 2%.
- February 2024 was extremely volatile: the rate peaked near ₦1,900 in mid-February and recovered to about ₦1,250 by late March. One value per month can't show that.
- Before the June 2023 float, the official rate understated the real cost of a dollar by 38 to 81%. That's why `ngn_per_usd` uses the parallel rate.

Suggested chart label: "NGN/USD: parallel-market rate from news reports (Nairametrics and others); official rate from the CBN. Past performance. Not a prediction or a promise."

## Check of the headline comparison

Take ₦20,000 at the end of October 2021 and value it at the end of October 2026, at the parallel rate:

| Kept in | Worth in naira |
| --- | --- |
| Naira | ₦20,000 |
| USDC | ₦49,027 |
| S&P 500 (SPY, dividends reinvested) | ₦86,256 |

At its worst point, the S&P position measured in naira was 19.8% below its previous high. The app computes all of this in code; this table is only a check.

## Rebuilding

The build scripts are not in this repo. The stock and official-rate columns can be pulled again from the two APIs above. The parallel-rate column was compiled by hand from the linked articles.
