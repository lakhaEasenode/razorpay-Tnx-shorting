/** Columns the uploaded Razorpay CSV must contain. Order does not matter; extra columns are allowed. */
export const REQUIRED_COLUMNS = [
  'entity_id',
  'type',
  'debit',
  'credit',
  'amount',
  'currency',
  'fee',
  'tax',
  'on_hold',
  'settled',
  'created_at',
  'settled_at',
  'settlement_id',
  'description',
  'notes',
  'payment_id',
  'arn',
  'settlement_utr',
  'order_id',
  'order_receipt',
  'method',
  'upi_flow',
  'card_network',
  'card_issuer',
  'card_type',
  'dispute_id',
  'additional_utr',
] as const;

export type SourceColumn = (typeof REQUIRED_COLUMNS)[number];

/** One input row exactly as read from the CSV. Every value is kept as a string. */
export type SourceRow = Record<string, string>;
