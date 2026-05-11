import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({
  name: 'failed_transactions',
})
export class FailedTransaction {
  @PrimaryColumn()
  hash: string; // transaction hash

  @Column({
    default: 0,
  })
  public retries: number;

  @Column({
    default: '',
  })
  error: string;

  // error trace
  @Column({
    default: '',
  })
  error_trace: string;

  /**
   * When true, the failure was caused by a temporary condition (MDW/node
   * overload, 429, 502/503/504, network timeout).  The retry logic applies
   * exponential back-off via next_retry_at instead of retrying immediately.
   */
  @Column({
    default: false,
  })
  is_transient: boolean;

  /**
   * Earliest time at which the retry runner may attempt this transaction again.
   * NULL means "retry on next cron run" (legacy / non-transient failures).
   * Populated for transient failures and updated after each unsuccessful retry
   * using exponential back-off capped at RETRY_MAX_DELAY_MS.
   */
  @Index()
  @Column({
    type: 'timestamp',
    nullable: true,
    default: null,
  })
  public next_retry_at: Date | null;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  public created_at: Date;
}
