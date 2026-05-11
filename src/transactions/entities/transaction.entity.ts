import { IPriceDto } from '@/tokens/dto/price.dto';
import { BigNumberTransformer } from '@/utils/BigNumberTransformer';
import BigNumber from 'bignumber.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  getMetadataArgsStorage,
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

// TypeORM's @Index decorator does not expose the `expression` option or per-column
// ordering (ASC/DESC). The two indexes below use getMetadataArgsStorage() to
// inject them directly into TypeORM's schema metadata so they are created,
// compared, and never silently dropped by schema synchronisation.
getMetadataArgsStorage().indices.push(
  {
    // Composite index with created_at DESC so PostgreSQL can serve
    // ORDER BY sale_address, created_at DESC without an extra sort step.
    target: Transaction,
    name: 'idx_transactions_saleaddress_createdat',
    expression: 'sale_address, created_at DESC',
  } as any,
  {
    // Functional index on the extracted 'ae' key of the market_cap JSONB column.
    // The partial WHERE clause keeps the index small (only non-null values).
    target: Transaction,
    name: 'idx_transactions_marketcap_ae',
    expression: "(market_cap->>'ae')",
    where: "(market_cap->>'ae') IS NOT NULL",
  } as any,
);
