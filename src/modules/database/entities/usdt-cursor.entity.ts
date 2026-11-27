import { Column, Entity, PrimaryColumn } from 'typeorm';
import { UsdtNetwork } from './invoice.entity';

/**
 * Курсор слушателя USDT. При первом запуске ставится на текущий блок или время,
 * чтобы старые переводы не закрыли новые инвойсы.
 */
@Entity({ name: 'usdt_cursors' })
export class UsdtCursorEntity {
  @PrimaryColumn({ type: 'varchar', length: 16 })
  network: UsdtNetwork;

  /** Блок, lt или время, до которого переводы уже разобраны. */
  @Column({ type: 'varchar', length: 128 })
  cursor: string;
}
