import { BigNumberTransformer } from '@/utils/BigNumberTransformer';
import { BigNumber } from 'bignumber.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  getMetadataArgsStorage,
} from 'typeorm';
import { IPriceDto } from '../dto/price.dto';

// Supports ORDER BY factory_address, market_cap DESC (used in getTokenRanks).
@Index('idx_token_factory_unlisted_market_cap', ['factory_address', 'unlisted', 'market_cap'])
@Entity()
export class Token {
  @PrimaryColumn()
  sale_address: string;

  @Index()
  @Column({
    default: false,
  })
  unlisted: boolean;

  @Column({
    default: 0,
  })
  last_sync_tx_count: number;

  @Column({
    default: 0,
  })
  tx_count: number;

  @Column({
    default: 0,
  })
  holders_count: number;

  @Index()
  @Column({
    nullable: true,
  })
  factory_address: string;

  @Column({
    nullable: true,
  })
  create_tx_hash: string;

  @Column({
    nullable: true,
  })
  dao_address: string;

  @Index()
  @Column({
    default: null,
  })
  creator_address: string;

  @Column({
    default: null,
  })
  beneficiary_address: string;

  @Column({
    default: null,
  })
  bonding_curve_address: string;

  @Column({
    default: 0n,
    type: 'numeric',
    transformer: BigNumberTransformer,
  })
  dao_balance: BigNumber;

  @Index()
  @Column({
    default: null,
  })
  owner_address: string;

  /**
   * Basic Token Info
   */
  @Index()
  @Column({
    default: null,
  })
  address: string;

  @Index()
  @Column()
  name: string;

  @Index()
  @Column()
  symbol: string;

  @Column({
    default: 18,
    type: 'bigint',
  })
  decimals: string;

  @Column({
    nullable: true,
  })
  collection: string;

  @Column({
    default: 0n,
    type: 'numeric',
    transformer: BigNumberTransformer,
  })
  price: BigNumber;

  @Column({
    type: 'json',
    nullable: true,
  })
  price_data!: IPriceDto;

  @Column({
    default: 0n,
    type: 'numeric',
    transformer: BigNumberTransformer,
  })
  sell_price: BigNumber;

  @Column({
    type: 'json',
    nullable: true,
  })
  sell_price_data!: IPriceDto;

  @Index()
  @Column({
    default: 0n,
    type: 'numeric',
    transformer: BigNumberTransformer,
  })
  market_cap: BigNumber;

  @Column({
    type: 'json',
    nullable: true,
  })
  market_cap_data!: IPriceDto;

  @Column({
    default: 0n,
    type: 'numeric',
    transformer: BigNumberTransformer,
  })
  total_supply: BigNumber;

  @Index()
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    default: 0,
  })
  trending_score: number;

  @Column({
    type: 'timestamp',
    nullable: true,
  })
  trending_score_update_at: Date;

  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  public created_at: Date;
}

// Expression indexes for the rank window function:
//   ORDER BY CASE WHEN market_cap = 0 THEN 1 ELSE 0 END, market_cap DESC, created_at ASC
//
// Two variants because the two callers use different WHERE clauses:
//   - queryTokensWithRanks: WHERE unlisted = false  (all factories)
//   - getTokenRanks:        WHERE factory_address = '...' AND unlisted = false
//
// TypeORM's @Index decorator cannot express computed columns or per-column DESC/ASC
// mixed ordering, so we inject via getMetadataArgsStorage directly.
getMetadataArgsStorage().indices.push(
  {
    // Used by queryTokensWithRanks — ranks all non-unlisted tokens.
    target: Token,
    name: 'idx_token_rank_sort_unlisted',
    expression:
      "(CASE WHEN market_cap = 0 THEN 1 ELSE 0 END), market_cap DESC, created_at ASC",
    where: 'unlisted = false',
  } as any,
  {
    // Used by getTokenRanks — ranks tokens for a specific factory only.
    target: Token,
    name: 'idx_token_rank_sort_factory',
    expression:
      "(CASE WHEN market_cap = 0 THEN 1 ELSE 0 END), market_cap DESC, created_at ASC",
    where: 'factory_address IS NOT NULL AND unlisted = false',
  } as any,
);
