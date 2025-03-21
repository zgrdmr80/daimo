import { DaimoNonce } from "@daimo/userop";
import { Pool } from "pg";
import { Hex, bytesToHex, numberToHex } from "viem";

import { chainConfig } from "../env";
import { retryBackoff } from "../utils/retryBackoff";

interface UserOp {
  transactionHash: Hex;
  logIndex: number;
  nonce: bigint;
  hash: Hex;
}

type OpCallback = (userOp: UserOp) => void;

/* User operation indexer. Used to track fulfilled requests. */
export class OpIndexer {
  private txHashToSortedUserOps: Map<Hex, UserOp[]> = new Map();

  private callbacks: Map<Hex, OpCallback[]> = new Map();

  addCallback(hash: Hex, cb: OpCallback) {
    const cbs = this.callbacks.get(hash);
    if (!cbs) {
      this.callbacks.set(hash, [cb]);
      return;
    }
    cbs.push(cb);
  }

  callback(userOp: UserOp) {
    const cbs = this.callbacks.get(userOp.hash);
    if (!cbs) return;
    cbs.forEach((cb) => cb(userOp));
    this.callbacks.delete(userOp.hash);
  }

  async load(pg: Pool, from: bigint, to: bigint) {
    const startTime = Date.now();
    const result = await retryBackoff(
      `opIndexer-logs-query-${from}-${to}`,
      () =>
        pg.query(
          `
        select tx_hash, log_idx, op_nonce, op_hash
        from erc4337_user_op
        where block_num >= $1 and block_num <= $2 and chain_id = $3
      `,
          [from, to, chainConfig.chainL2.id]
        )
    );
    console.log(
      `[OP] loaded ${result.rows.length} ops in ${Date.now() - startTime}ms`
    );

    result.rows.forEach((row) => {
      const userOp: UserOp = {
        transactionHash: bytesToHex(row.tx_hash, { size: 32 }),
        logIndex: row.log_idx,
        nonce: BigInt(row.op_nonce),
        hash: bytesToHex(row.op_hash, { size: 32 }),
      };
      const curLogs = this.txHashToSortedUserOps.get(userOp.transactionHash);
      const newLogs = curLogs ? [...curLogs, row] : [userOp];
      this.txHashToSortedUserOps.set(
        userOp.transactionHash,
        newLogs.sort((a, b) => a.logIndex - b.logIndex)
      );

      const nonceMetadata = DaimoNonce.fromHex(
        numberToHex(userOp.nonce, { size: 32 })
      )?.metadata.toHex();
      if (!nonceMetadata) return;

      this.callback(userOp);
    });
    console.log(
      `[OP] processed ${result.rows.length} ops in ${Date.now() - startTime}ms`
    );
  }

  /**
   * Interpret a (txHash, queryLogIndex) as having originated from a userop and fetch the userop log of it.
   */
  fetchUserOpLog(txHash: Hex, queryLogIndex: number): UserOp | undefined {
    const possibleLogs = this.txHashToSortedUserOps.get(txHash) || [];
    for (const log of possibleLogs) {
      if (log.logIndex > queryLogIndex) {
        return log;
      }
    }
    return undefined;
  }
}
