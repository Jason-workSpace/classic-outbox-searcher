import { ArbSys__factory } from '@arbitrum/sdk/dist/lib/abi/factories/ArbSys__factory';
import { ARB_SYS_ADDRESS } from '@arbitrum/sdk/dist/lib/dataEntities/constants';
import { Outbox__factory } from '@arbitrum/sdk/dist/lib/abi/classic/factories/Outbox__factory';
import {
  L2ToL1MessageClassic,
  MessageBatchProofInfo,
} from '@arbitrum/sdk/dist/lib/message/L2ToL1MessageClassic';
import { BaseContract, BigNumber, ethers, EventFilter, providers } from 'ethers';
import args from './getClargs';
import fs from 'fs';
import { Outbox } from '@arbitrum/sdk/dist/lib/abi/classic/Outbox';
import {
  ALREADY_SPENT,
  NOT_INIT,
  NO_OUTBOX_ENTRY,
  OutboxSearchConfig,
  OUTBOX_TYPE,
  SearchConfig,
  SUCESS,
  TxInfo,
  UNKNOWN_ERROR,
  WithdrawSearchConfig,
  WITHDRAW_TYPE,
} from './constant';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

//Use batchProvider to call batch of target filter event
const callToGetEvents = async (
  from: number,
  to: number,
  contract: BaseContract,
  filter: EventFilter,
) => {
  const res: string[][] = [];
  const eventResults: ethers.Event[][] = [];
  //To reduce the rpc call load, we use JsonRpcBatchProvider way.
  let promises: Promise<ethers.Event[]>[] = [];
  let counter = from;
  for (; counter <= to - 200000; counter += 20000) {
    promises.push(contract.queryFilter(filter, counter, counter + 19999));
    //each batch only contains 800 call or it will cause rpc throughput errors
    if (counter % 800000 == 0) {
        console.log(counter)
      const cur = await Promise.all(promises);
      eventResults.push(...cur);
      promises = [];
      wait(1500); //sleep or it will cause rpc throughput errors
    }
  }
  promises.push(contract.queryFilter(filter, counter, to));
  const cur = await Promise.all(promises);
  //the event results have too many param we don't need, so just extract args and txHash
  eventResults.push(...cur);
  for (let i = 0; i < eventResults.length; i++) {
    eventResults[i].forEach((element) => {
      const current: string[] = [];
      current.push(...element.args!);
      current.push(element.transactionHash);
      res.push(current);
    });
  }
  console.log(res.length);
  return res;
};

export const getAllWithdrawal = async (
  from: number,
  to: number,
  l2BatchProvider: providers.JsonRpcBatchProvider,
) => {
  const arbsys = ArbSys__factory.connect(ARB_SYS_ADDRESS, l2BatchProvider);
  const filter = arbsys.filters.L2ToL1Transaction();
  const res = await callToGetEvents(from, to, arbsys, filter);

  return res;
};

export const getAllOutBoxExecuted = async (
  from: number,
  to: number,
  l1BatchProvider: providers.JsonRpcBatchProvider,
) => {
  const outbox = Outbox__factory.connect(
    '0x760723cd2e632826c38fef8cd438a4cc7e7e1a40',
    l1BatchProvider,
  );
  const filter = outbox.filters.OutBoxTransactionExecuted();
  const res = await callToGetEvents(from, to, outbox, filter);
  return res;
};

//Read the tx recorded in file and get the related TxInfo
const readAndGetAllTx = (filePath: string, withdrawlType: boolean): Map<string, TxInfo> => {
  const rawData = fs.readFileSync(filePath);
  const buffer = rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength);
  const rawString = Buffer.from(buffer).toString();
  const rawArray = rawString.split(',');
  // console.log(withdrawRawArry)
  const txInfo = extractTxInfo(rawArray, withdrawlType);
  return txInfo;
};

//Compare withdrawMap and outboxMap get the unexcuted tx (include in withdrawMap but not in outboxMap)
export const compareAndOutputPendingTx = (
  withdrawMap: Map<string, TxInfo>,
  outboxMap: Map<string, TxInfo>,
): Map<string, TxInfo> => {
  const pendingTx = new Map<string, TxInfo>();
  //compare
  withdrawMap.forEach((value, key) => {
    if (!outboxMap.has(key)) {
      pendingTx.set(key, value);
    }
  });

  return pendingTx;
};

//search the events args and only extract what TxInfo needed param
const extractTxInfo = (rawArry: string[], withdrawlType: boolean): Map<string, TxInfo> => {
  const txMap = new Map<string, TxInfo>();
  //Get the related config, which is used when search the event args
  const searchConfig: SearchConfig = withdrawlType ? WithdrawSearchConfig : OutboxSearchConfig;
  //See the event array is valid or not
  if(rawArry.length % searchConfig.eachLength != 0) {
    throw Error('Wrong type tx event input');
  }
  for (let i = 0; i < rawArry.length; i += searchConfig.eachLength) {
    const currentElem: TxInfo = {
      txhash: rawArry[i + searchConfig.txhashAt],
      batchNumber: BigNumber.from(rawArry[i + searchConfig.batchNumberAt]),
      indexInBatch: BigNumber.from(rawArry[i + searchConfig.indexInBatchAt]),
      inputs: null,
      returnType: NOT_INIT,
      estimateGas: BigNumber.from(0),
    };
    const curKey = ethers.utils.solidityKeccak256(
      ['uint256', 'uint256'],
      [currentElem.batchNumber, currentElem.indexInBatch],
    );
    txMap.set(curKey, currentElem);
  }

  return txMap;
};

export const getAllProofs = async (
  pendingTxMap: Map<string, TxInfo>,
  l1BatchProvider: providers.JsonRpcBatchProvider,
  l2BatchProvider: providers.JsonRpcBatchProvider,
) => {
  //To reduce the rpc call load, we use JsonRpcBatchProvider way.
  let promises: Promise<void>[] = [];
  let counter = 0;
  for (const item of pendingTxMap) {
    promises.push(getProof(item[1],l1BatchProvider,l2BatchProvider));
    counter++;
    // each batch only contains 800 call or it will cause rpc throughput errors
    if (counter % 800 == 0) {
      const currProof = await Promise.all(promises);
      promises = [];
      console.log(counter);
      wait(1500); //sleep or it will cause rpc throughput errors
    }
  }
  // //Call those promises rpc call in a single time.
  await Promise.all(promises);
  return pendingTxMap;
};

const getProof = async (
    txinfo:TxInfo,
    l1BatchProvider: providers.JsonRpcBatchProvider,
    l2BatchProvider: providers.JsonRpcBatchProvider
) => {
    const l2ToL1Classic = L2ToL1MessageClassic.fromBatchNumber(
      l1BatchProvider,
      txinfo.batchNumber,
      txinfo.indexInBatch,
    );
    const proof = await l2ToL1Classic.tryGetProof(l2BatchProvider)
    txinfo.inputs = proof
}

//send eth_estimateGas and catch the errors, if errors returned, mentioned at item.returnType
const estimateHandler = async (outbox: Outbox, item: TxInfo) => {
  const proofInfo = item.inputs;
  let res: BigNumber;
  if (proofInfo === null) {
    return;
  }
  try {
    res = await outbox.estimateGas.executeTransaction(
      item.batchNumber,
      proofInfo.proof,
      proofInfo.path,
      proofInfo.l2Sender,
      proofInfo.l1Dest,
      proofInfo.l2Block,
      proofInfo.l1Block,
      proofInfo.timestamp,
      proofInfo.amount,
      proofInfo.calldataForL1,
    );
  } catch (err) {
    const e = err as Error;
    if (e?.message?.toString().includes('ALREADY_SPENT')) {
      item.returnType = ALREADY_SPENT;
    } else if (e?.message?.toString().includes('NO_OUTBOX_ENTRY')) {
      item.returnType = NO_OUTBOX_ENTRY;
    } else {
        console.log(e?.message?.toString())
      item.returnType = UNKNOWN_ERROR;
    }
    return;
  }
  item.returnType = SUCESS;
  item.estimateGas = res;
};

export const getAllEstimate = async (
  estimateInfo: Map<string, TxInfo>,
  l1BatchProvider: providers.JsonRpcBatchProvider,
) => {
  
  const outbox = Outbox__factory.connect(
    '0x760723cd2e632826c38fef8cd438a4cc7e7e1a40',
    l1BatchProvider,
  );

  let promises: Promise<void>[] = [];
  let counter = 0;
  for (const item of estimateInfo) {
    promises.push(estimateHandler(outbox, item[1]));
    counter++;
    // each batch only contains 100 call or it will cause rpc throughput errors
    if (counter % 100 == 0) {
      await Promise.all(promises);
      promises = [];
      wait(1500); //sleep or it will cause rpc throughput errors
    }
  }
  await Promise.all(promises);
};

export const checkBlockRange = () => {
  if (!args.from || !args.to) {
    throw new Error('You need set both from and to');
  }
  if (args.to < args.from) {
    throw new Error('from should not higher than to');
  }
};

export const checkOutput = () => {
  if (!args.outputFile) {
    throw new Error('You need set outputFile');
  }
};

export const checkAndGetInput = () => {
  if (!args.outboxInput || !args.withdrawInput) {
    throw new Error('You need set both outbox and withdraw tx files');
  }
  const withdrawTx = readAndGetAllTx(args.withdrawInput, WITHDRAW_TYPE);
  const outboxTx = readAndGetAllTx(args.outboxInput, OUTBOX_TYPE);
  return {
    withdraw: withdrawTx,
    outbox: outboxTx,
  };
};

export const checkAndGetProvider = (rpcUrl: string | undefined) => {
  if (!rpcUrl) {
    throw new Error('No l1 rpc url provided');
  }
  return new ethers.providers.JsonRpcBatchProvider(rpcUrl);
};
