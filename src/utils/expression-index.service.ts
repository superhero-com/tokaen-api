/**
 * Creates PostgreSQL expression/partial indexes that TypeORM's schema-sync
 * cannot handle.  TypeORM's TableIndex.create() discards the `expression`
 * field, so any @Index with expression ends up generating "CREATE INDEX ON t ()"
 * which PostgreSQL rejects with "syntax error at or near )".
 *
 * This service runs CREATE INDEX IF NOT EXISTS ... once per startup, which is
 * idempotent and safe regardless of the DB_SYNC setting.
 */
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ExpressionIndexService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExpressionIndexService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.createExpressionIndexes();
  }

  private async createExpressionIndexes(): Promise<void> {
    const indexes: { name: string; sql: string }[] = [
      {
        // Composite index with created_at DESC for ORDER BY sale_address, created_at DESC.
        name: 'idx_transactions_saleaddress_createdat',
        sql: `CREATE INDEX IF NOT EXISTS "idx_transactions_saleaddress_createdat"
              ON "transactions" (sale_address, created_at DESC)`,
      },
      {
        // Functional (expression) index on the JSONB 'ae' key of market_cap.
        // Partial — only rows where the value is not NULL are indexed.
        name: 'idx_transactions_marketcap_ae',
        sql: `CREATE INDEX IF NOT EXISTS "idx_transactions_marketcap_ae"
              ON "transactions" ((market_cap->>'ae'))
              WHERE (market_cap->>'ae') IS NOT NULL`,
      },
      {
        // Covers queryTokensWithRanks: ORDER BY CASE … END, market_cap DESC, created_at ASC
        // filtered to unlisted = false (all factories).
        name: 'idx_token_rank_sort_unlisted',
        sql: `CREATE INDEX IF NOT EXISTS "idx_token_rank_sort_unlisted"
              ON "token" (
                (CASE WHEN market_cap = 0 THEN 1 ELSE 0 END),
                market_cap DESC,
                created_at ASC
              )
              WHERE unlisted = false`,
      },
      {
        // Covers getTokenRanks: same ordering but restricted to a single factory.
        name: 'idx_token_rank_sort_factory',
        sql: `CREATE INDEX IF NOT EXISTS "idx_token_rank_sort_factory"
              ON "token" (
                (CASE WHEN market_cap = 0 THEN 1 ELSE 0 END),
                market_cap DESC,
                created_at ASC
              )
              WHERE factory_address IS NOT NULL AND unlisted = false`,
      },
    ];

    for (const { name, sql } of indexes) {
      try {
        await this.dataSource.query(sql);
        this.logger.log(`Expression index "${name}" ready`);
      } catch (error: any) {
        this.logger.error(
          `Failed to create expression index "${name}": ${error.message}`,
          error.stack,
        );
      }
    }
  }
}
