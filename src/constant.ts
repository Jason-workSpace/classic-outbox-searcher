import { MessageBatchProofInfo } from '@arbitrum/sdk/dist/lib/message/L2ToL1MessageClassic';
import { BigNumber } from 'ethers';

export interface SearchConfig {
  eachLength: number;
  txhashAt: number;
  batchNumberAt: number;
  indexInBatchAt: number;
}

export interface TxInfo {
  txhash: string;
  batchNumber: BigNumber;
  indexInBatch: BigNumber;
  inputs: MessageBatchProofInfo | null;
  returnType: number;
  estimateGas: BigNumber | null;
}

export const WithdrawSearchConfig: SearchConfig = {
  eachLength: 11,
  txhashAt: 10,
  batchNumberAt: 3,
  indexInBatchAt: 4,
};

export const OutboxSearchConfig: SearchConfig = {
  eachLength: 5,
  txhashAt: 4,
  batchNumberAt: 2,
  indexInBatchAt: 3,
};

export const NOT_INIT = 0;
export const SUCESS = 1;
export const ALREADY_SPENT = 2;
export const NO_OUTBOX_ENTRY = 3;
export const UNKNOWN_ERROR = 4;
export const OUTBOX_TYPE = false;
export const WITHDRAW_TYPE = true;

const outboxes = ['0x667e23ABd27E623c11d4CC00ca3EC4d0bD63337a', '0x760723CD2e632826c38Fef8CD438A4CC7E7E1A40']
