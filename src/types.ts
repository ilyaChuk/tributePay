export type TributeEvent<TPayload = unknown> = {
  name: string;
  payload: TPayload;
  created_at?: string;
};

export type PaymentCompletedPayload = {
  payment_id?: string;
  id?: string;
  [key: string]: unknown;
};
