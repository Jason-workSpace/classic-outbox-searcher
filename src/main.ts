import args from './getClargs';
import {
  getAllWithdrawal,
  getAllOutBoxExecuted,
  getAllProofs,
  getAllEstimate,
  checkBlockRange,
  checkOutput,
  checkAndGetProvider,
  checkAndGetInput,
  compareAndOutputPendingTx,
} from './utils';
import fs from 'fs';
import { SUCESS } from './constant';

let l1BatchProvider;
let l2BatchProvider;

//TODO: 2 outboxes
const main = async () => {
  switch (args.action) {
    case 'GetOutboxEvent':
      checkBlockRange();
      checkOutput();
      l1BatchProvider = checkAndGetProvider(args.l1RpcUrl);
      const outBoxTx = await getAllOutBoxExecuted(args.from!, args.to!, l1BatchProvider);
      fs.writeFileSync(args.outputFile!, outBoxTx.toString());
      break;
    case 'GetWithdrawEvent':
      checkBlockRange();
      checkOutput();
      l2BatchProvider = checkAndGetProvider(args.l2RpcUrl);
      const withdrawalTx = await getAllWithdrawal(args.from!, args.to!, l2BatchProvider);
      console.log(withdrawalTx)
      fs.writeFileSync(args.outputFile!, withdrawalTx.toString());
      break;
    case `CompareAndGetEstimate`:
      l1BatchProvider = checkAndGetProvider(args.l1RpcUrl);
      l2BatchProvider = checkAndGetProvider(args.l2RpcUrl);
      const txs = checkAndGetInput();
      const pending = compareAndOutputPendingTx(txs.withdraw, txs.outbox);
      const unexecuteProof = await getAllProofs(pending, l1BatchProvider, l2BatchProvider);
      await getAllEstimate(unexecuteProof, l1BatchProvider);
      const num: string[] = []
      for(let i of unexecuteProof) {
        if(i[1].returnType === SUCESS){
            num.push(i[1].estimateGas?.toHexString()!)
        }
      }
      fs.writeFileSync("num", num.toString())
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
