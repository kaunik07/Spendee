// Statement import — telling a real payment apart from a merchant refund
// among a document's credit-direction rows.
//
// A bank statement's negative/credit-direction amounts mean two genuinely
// different things, and lumping them together is wrong either way:
//
//   - A PAYMENT reduces what you owe by moving money from elsewhere (a bank
//     transfer, autopay) — "Payment Thank You-Mobile -1,500.00". This isn't
//     spend reversing; it never touched a category, so it has no business in
//     the expense list at all. It stays in the collapsed, excluded Credits
//     section exactly as before.
//   - A REFUND reverses an earlier PURCHASE — "AMAZON MKTPLACE PMTS ...
//     -28.14" undoing an Amazon charge. This DID touch a category, and a
//     user tracking category spend needs it counted — a $28 refund that
//     silently vanishes into "Credits" leaves that category's total wrong
//     until they notice and go dig for it. So a refund is imported as a
//     genuine negative expense: same merchant, same category, included by
//     default, reducing that category's spend.
//
// The signal is the descriptor text, not the merchant/amount — a payment's
// descriptor names the payment mechanism ("Payment Thank You", "Autopay",
// "Online Payment"), never a merchant. Anything else with a negative/credit
// amount is treated as a refund: by construction, a section that also
// contains ordinary debit purchases doesn't mix in bank-transfer rows, so a
// merchant-shaped credit row here is a reversal of one of those purchases.

const PAYMENT_PATTERNS: RegExp[] = [
  /\bpayment\s+thank\s+you\b/i,
  /\bonline\s+payment\b/i,
  /\bautopay\b/i,
  /\bauto[- ]?pay(?:ment)?\b/i,
  /\bpayment\s+received\b/i,
  /\bmobile\s+payment\b/i,
  /\bbill\s?pay\b/i,
  /\belectronic\s+payment\b/i,
  /\bdirect\s+debit\s+payment\b/i,
  /\bcard\s?member\s+payment\b/i,
];

/** True for a real payment (autopay, bank transfer) — false for anything else, including an ordinary merchant refund. */
export function isPaymentDescriptor(description: string): boolean {
  return PAYMENT_PATTERNS.some((re) => re.test(description));
}
