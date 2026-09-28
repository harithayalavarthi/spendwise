# Test fixtures

**Synthetic data only.** Every file here is made up: invented merchants,
round-ish amounts, dates in 2026. Never copy a real statement, a real row, or a
real account/card number into this folder — not even "anonymized" — because
fixtures are committed and pushed.

Name files after what they exercise, e.g. `csv-debit-credit-columns.csv`,
`csv-credit-card.csv`, `csv-scotiabank-type-column.csv`. Keep each small (a
handful of rows) and add a one-line comment in the test that uses it saying
which real-world layout it imitates.
