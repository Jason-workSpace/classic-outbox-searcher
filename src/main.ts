import args from './getClargs';
import {
  getAllWithdrawal,
  getAllOutBoxExecuted,
  getAllProofs,
  setAllEstimate,
  checkBlockRange,
  checkAndGetProvider,
  checkAndGetTxns,
  compareAndOutputPendingTx,
  setTxInfoJSON,
  getOutbox,
  extractTxInfo,
  getTxPath,
} from './utils';
import fs from 'fs';
import { TxInfo, WITHDRAW_TYPE } from './constant';

let l1BatchProvider;
let l2BatchProvider;

const main = async () => {
  let outboxAddr;
  let txInfo;
  switch (args.action) {
    case 'GetOutboxEvent':
      checkBlockRange();
      l1BatchProvider = checkAndGetProvider(args.l1RpcUrl);
      outboxAddr = getOutbox();
      const outBoxTx = await getAllOutBoxExecuted(
        outboxAddr,
        args.from!,
        args.to!,
        l1BatchProvider,
      );
      fs.writeFileSync(args.outputFile!, outBoxTx.toString());
      break;

    case 'GetWithdrawEvent':
      checkBlockRange();
      l1BatchProvider = checkAndGetProvider(args.l1RpcUrl);
      l2BatchProvider = checkAndGetProvider(args.l2RpcUrl);
      const withdrawalTx = await getAllWithdrawal(args.from!, args.to!, l2BatchProvider);
      await getTxPath(withdrawalTx, l1BatchProvider, l2BatchProvider)
      fs.writeFileSync(args.outputFile!, withdrawalTx.toString());
      break;

    case `CompareAndGetEstimate`:
      l1BatchProvider = checkAndGetProvider(args.l1RpcUrl);
      // outboxAddr = getOutbox();
      const txns = checkAndGetTxns();
      txInfo = compareAndOutputPendingTx(txns.withdraw, txns.outbox);
      await setAllEstimate(txInfo, l1BatchProvider);
      const txInfoJSONs = setTxInfoJSON(txInfo);
      fs.writeFileSync(args.outputFile!, txInfoJSONs.toString());
      break;
      
    default:
      console.log(`Unknown action: ${args.action}`);
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
