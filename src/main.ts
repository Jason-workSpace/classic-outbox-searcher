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
      let one=0
      let two=0
      let three=0
      let four=0
      for(let i of unexecuteProof) {
        if(i[1].returnType === 1){
            one++
            num.push(i[1].estimateGas?.toHexString()!)
        }else if(i[1].returnType === 2) {
            two++
        }else if(i[1].returnType === 3) {
            three++
        }else if(i[1].returnType === 4) {
            four++
        }
        
      }
      console.log('1: ' + one)
      console.log('2: ' + two)
      console.log('3: ' + three)
      console.log('4: ' + four)
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
