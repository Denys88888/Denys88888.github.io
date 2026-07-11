// Pi Network SDK types
export interface PiAuthResult {
  accessToken: string;
  user: {
    uid: string;
    username: string;
  };
}

export interface PiPayment {
  identifier: string;
  user_uid: string;
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
  txid?: string;
  created_at: string;
  status: 'pending' | 'approved' | 'completed' | 'cancelled';
}

export interface PiPaymentArgs {
  amount: number;
  memo: string;
  metadata?: Record<string, unknown>;
}

export interface PiPaymentError {
  message: string;
  code?: string;
}
