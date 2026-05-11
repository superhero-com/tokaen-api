import { IPriceDto } from '@/tokens/dto/price.dto';
import { BigNumberTransformer } from '@/utils/BigNumberTransformer';
import BigNumber from 'bignumber.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({
  name: 'transactions',
})
// Partial composite index used by the LATERAL "latest market cap per token" query.
@Index('idx_transactions_sale_address_created_at_market_cap_ae', [
  'sale_address',
  'created_at',
], { where: "(market_cap->>'ae') IS NOT NULL" })
// General-purpose composite index covering the most common filter/sort pattern.
// Defined via getMetadataArgsStorage (below) so TypeORM preserves the DESC ordering.
// Composite index supporting queries filtered on verified + block_height.
@Index('idx_transactions_verified_blockheight_createdat', [
  'verified',
  'block_height',
  'created_at',
])
// Named index on created_at — replaces the anonymous field-level @Index().
@Index('idx_transactions_createdat', ['created_at'])
export class Transaction {
  @Index()
  @PrimaryColumn()
  tx_hash: string;

  @Index()
  @Column()
  sale_address: string;

  @Column()
  tx_type: string; // buy/sell/create_community

  @Column()
  block_height: number;

  @Column({
    default: false,
  })
  verified: boolean; // If this transaction is verified

  @Index()
  @Column()
  address: string; // Address of the user who made this transaction

  @Column({
    default: 0n,
    type: 'numeric',
    transformer: BigNumberTransformer,
  })
  volume: BigNumber; // Total Units was bought/sold

  @Column({
    default: 0n,
    type: 'numeric',
    transformer: BigNumberTransformer,
  })
  protocol_reward: BigNumber; // Protocol reward for this transaction

  @Column({
    type: 'json',
  })
  amount: IPriceDto; // Total spent/received amount

  @Column({
    type: 'json',
  })
  unit_price: IPriceDto; // Unit price of this transaction
  //
  @Column({
    type: 'json',
    nullable: true,
  })
  previous_buy_price!: IPriceDto; // Previous buy price before this transaction

  @Column({
    type: 'json',
  })
  buy_price: IPriceDto; // Buy price of this transaction

  @Column({
    type: 'json',
    nullable: true,
  })
  sell_price!: IPriceDto; // TODO: remove

  @Column({
    default: 0n,
    type: 'numeric',
    transformer: BigNumberTransformer,
  })
  total_supply: BigNumber; // Total supply of the token at the time of this transaction

  @Column({
    type: 'json',
    nullable: true,
  })
  market_cap!: IPriceDto; // Market cap data at the time of this transaction

  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  public created_at: Date;
}

// Expression indexes (composite with DESC, JSONB extraction) cannot be created by
// TypeORM's schema-sync because TableIndex.create() drops the `expression` field.
// They are created at startup by ExpressionIndexService via CREATE INDEX IF NOT EXISTS.
