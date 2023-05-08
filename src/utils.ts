import { ArbSys__factory } from '@arbitrum/sdk/dist/lib/abi/factories/ArbSys__factory';
import { ARB_SYS_ADDRESS } from '@arbitrum/sdk/dist/lib/dataEntities/constants';
import { Outbox__factory } from '@arbitrum/sdk/dist/lib/abi/classic/factories/Outbox__factory';
import { L2ToL1MessageClassic } from '@arbitrum/sdk/dist/lib/message/L2ToL1MessageClassic';
import { BaseContract, BigNumber, ethers, EventFilter, providers } from 'ethers';
import args from './getClargs';
import fs from 'fs';
import { Outbox } from '@arbitrum/sdk/dist/lib/abi/classic/Outbox';
import {
  ALREADY_SPENT,
  HOP_ALREADY_CONFIRMED,
  NOT_INIT,
  NO_OUTBOX_ENTRY,
  outboxes,
  OutboxSearchConfig,
  OUTBOX_TYPE,
  SearchConfig,
  SUCESS,
  TxInfo,
  UNKNOWN_ERROR,
  WithdrawSearchConfig,
  WITHDRAW_TYPE,
} from './constant';


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
  for (; counter <= to - 200000; counter += 200000) {
    promises.push(contract.queryFilter(filter, counter, counter + 199999));
    //each batch only contains 1200000 blocks' call or it will cause rpc throughput errors
    if (counter % 1200000 == from && counter != from) {
      const cur = await Promise.all(promises);
      eventResults.push(...cur);
      promises = [];
      console.log(`Now already search ${counter} blocks for events, sum ${to}`);
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

export const getTxPath = async (
  events: string[][],
  l1BatchProvider: providers.JsonRpcBatchProvider,
  l2BatchProvider: providers.JsonRpcBatchProvider,
) => {
  let counter = 0;
  let promises: Promise<number>[] = [];
  for(;counter < events.length ; counter++) {
    promises.push(getProofToArr(events[counter], l1BatchProvider, l2BatchProvider))
    //each batch only contains 980 proof call or it will cause rpc throughput errors
    if (counter % 980 == 0 && counter != 0) {
      await Promise.all(promises);
    }
    promises = [];
    console.log(`Now already got ${counter} proofs, sum ${events.length}`);
  }
  await Promise.all(promises);
};

const getProofToArr = async (
  event: string[],
  l1BatchProvider: providers.JsonRpcBatchProvider,
  l2BatchProvider: providers.JsonRpcBatchProvider,
): Promise<number> => {
  const iOutbox = Outbox__factory.createInterface();
  const l2ToL1Classic = L2ToL1MessageClassic.fromBatchNumber(
    l1BatchProvider,
    BigNumber.from(event[3]), // Bacth number index
    BigNumber.from(event[4]), // IndexInbatch index
  );
  const proofInfo = await l2ToL1Classic.tryGetProof(l2BatchProvider);
  let inputs: string
  if (proofInfo === null) {
    console.log("Error: find one null proof")
    return await getProofToArr(event,l1BatchProvider,l2BatchProvider)
  } else {
    inputs = iOutbox.encodeFunctionData('executeTransaction', [
      BigNumber.from(event[WithdrawSearchConfig.batchNumberAt]),
      proofInfo.proof,
      proofInfo.path,
      proofInfo.l2Sender,
      proofInfo.l1Dest,
      proofInfo.l2Block,
      proofInfo.l1Block,
      proofInfo.timestamp,
      proofInfo.amount,
      proofInfo.calldataForL1,
    ]);
    event.push(proofInfo.path.toString())
    event.push(inputs)
    return event.length
  }
  
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
  outboxAddr: string,
  from: number,
  to: number,
  l1BatchProvider: providers.JsonRpcBatchProvider,
) => {
  const outbox = Outbox__factory.connect(outboxAddr, l1BatchProvider);
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
  console.log(pendingTx.size)
  return pendingTx;
};

//search the events args and only extract what TxInfo needed param
export const extractTxInfo = (rawArry: string[], withdrawlType: boolean): Map<string, TxInfo> => {
  const txMap = new Map<string, TxInfo>();
  //Get the related config, which is used when search the event args
  const searchConfig: SearchConfig = withdrawlType ? WithdrawSearchConfig : OutboxSearchConfig;
  //See the event array is valid or not
  if (rawArry.length % searchConfig.eachLength != 0) {
    throw Error('Wrong type tx event input');
  }
  for (let i = 0; i < rawArry.length; i += searchConfig.eachLength) {
    const batchNumber = BigNumber.from(rawArry[i + searchConfig.batchNumberAt])
    const currentElem: TxInfo = {
      txhash: rawArry[i + searchConfig.txhashAt],
      batchNumber: batchNumber,
      path: BigNumber.from(rawArry[i + searchConfig.path]),
      //Input's index in withdraw array is 12th of each length
      inputs: withdrawlType ? rawArry[i + 12]: null,
      returnType: NOT_INIT,
      outbox: batchNumber.lt(30) ? outboxes[0] : outboxes[1],
      estimateGas: BigNumber.from(0),
    };
    const curKey = ethers.utils.solidityKeccak256(
      ['uint256', 'uint256'],
      [currentElem.batchNumber, currentElem.path],
    );
    txMap.set(curKey, currentElem);
  }

  return txMap;
};

const setOneJSON = (txInfo: TxInfo): string => {
  const iOutbox = Outbox__factory.createInterface()
  let targetAddr
  let targetCalldata

  if(txInfo.inputs !== null) {
    const decodedData = iOutbox.decodeFunctionData("executeTransaction",txInfo.inputs)
    targetAddr = decodedData[4]
    targetCalldata = decodedData[9]
  }
  
  return `
  {
    l2txhash: ${txInfo.txhash},
    batchNumber: ${txInfo.batchNumber},
    path: ${txInfo.path},
    returnType: ${txInfo.returnType},
    outbox: ${txInfo.outbox},
    calldata: ${txInfo.inputs},
    targetAddr: ${targetAddr},
    targetCalldata: ${targetCalldata},
    estimateGas: ${txInfo.estimateGas}
  }`;
};

//send eth_estimateGas and catch the errors, if errors returned, mentioned at item.returnType
const estimateHandler = async (outbox: Outbox, item: TxInfo) => {
  const proofInfo = item.inputs;
  let res: BigNumber;
  if (proofInfo === null) {
    return;
  }
  try {
    res = await outbox.provider.estimateGas({ to: outbox.address, data: item.inputs! });
  } catch (err) {
    const e = err as Error;
    if (e?.message?.toString().includes('ALREADY_SPENT')) {
      item.returnType = ALREADY_SPENT;
    } else if (e?.message?.toString().includes('NO_OUTBOX_ENTRY')) {
      item.returnType = NO_OUTBOX_ENTRY;
    } else if(e?.message?.toString().includes('L1_BRG: TransferRoot already confirmed')) {
      item.returnType = HOP_ALREADY_CONFIRMED;
    } else {
      console.log(e?.message?.toString());
      item.returnType = UNKNOWN_ERROR;
    }
    return;
  }
  item.returnType = SUCESS;
  item.estimateGas = res;
};

export const setAllEstimate = async (
  estimateInfo: Map<string, TxInfo>,
  l1BatchProvider: providers.JsonRpcBatchProvider,
) => {
  let promises: Promise<void>[] = [];
  let counter = 0;
  for (const item of estimateInfo) {
    const outboxAddr = item[1].outbox;
    const outbox = Outbox__factory.connect(outboxAddr, l1BatchProvider);
    promises.push(estimateHandler(outbox, item[1]));
    counter++;
    // each batch only contains 100 call or it will cause rpc throughput errors
    if (counter % 120 == 0 && counter != 0) {
      await Promise.all(promises);
      promises = [];
      console.log(`Now already estimated ${counter} txns, sum ${estimateInfo.size}`);
    }
  }
  await Promise.all(promises);
};

export const setTxInfoJSON = (txMap: Map<string, TxInfo>) => {
  const TxInfoJSON: string[] = [];
  for (const item of txMap) {
    TxInfoJSON.push(setOneJSON(item[1]));
  }
  return TxInfoJSON;
};

export const checkBlockRange = () => {
  if (!args.to) {
    throw new Error('You need set to');
  }
  if (args.to < args.from) {
    throw new Error('from should not higher than to');
  }
};

export const checkAndGetTxns = () => {
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
    throw new Error('No rpc url provided');
  }
  return new ethers.providers.JsonRpcBatchProvider(rpcUrl);
};

export const getOutbox = () => {
  if (args.outboxType === 'outbox2') {
    return outboxes[0];
  } else if (args.outboxType === 'outbox3') {
    return outboxes[1];
  } else {
    throw new Error('Wrong outbox type');
  }
};
