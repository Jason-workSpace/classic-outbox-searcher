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
} from './utils';
import fs from 'fs';

let l1BatchProvider;
let l2BatchProvider;

const main = async () => {
  let outboxAddr;
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
      l2BatchProvider = checkAndGetProvider(args.l2RpcUrl);
      const withdrawalTx = await getAllWithdrawal(args.from!, args.to!, l2BatchProvider);
      fs.writeFileSync(args.outputFile!, withdrawalTx.toString());
      break;

    case `CompareAndGetEstimate`:
      l1BatchProvider = checkAndGetProvider(args.l1RpcUrl);
      l2BatchProvider = checkAndGetProvider(args.l2RpcUrl);
      outboxAddr = getOutbox();
      const txns = checkAndGetTxns();
      const txInfo = compareAndOutputPendingTx(txns.withdraw, txns.outbox);
      await getAllProofs(txInfo, l1BatchProvider, l2BatchProvider);
      await setAllEstimate(outboxAddr, txInfo, l1BatchProvider);
      const txInfoJSONs = setTxInfoJSON(outboxAddr, txInfo);
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
