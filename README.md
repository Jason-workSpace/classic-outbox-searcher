# Classic Outbox Searcher
This is used to find all l2 -> l1 txns and get those l1 unexecuted txns' execution estimate Gas.

## How to do this?
1. We search all outbox event `OutBoxTransactionExecuted`.
2. We search all arbsys event `L2ToL1Transaction`.
3. Use the events got from (1) and (2) to compare which txns hasn't been executed (Those tx batch info emited in (2) but not in (1)).
4. Use the txns got from (3) and call `legacyLookupMessageBatchProof` of `NodeInterface` to get proofs, then use eth_estimateGas to call l1 get all estimate information.

## Command Process
Because it will use too many rpc calls to execute those flows one time we described above, so we seperate it to 3 commands to run. First command do (1), second command do (2), third command do (3) and (4).
Also, because we have 2 classic outboxes , you might need specific outbox type when search event `OutBoxTransactionExecuted`: outbox2 for `0x667e23ABd27E623c11d4CC00ca3EC4d0bD63337a` and outbox3 for `0x760723CD2e632826c38Fef8CD438A4CC7E7E1A40`.
1. Get all `OutBoxTransactionExecuted`:
```
yarn ts-node ./src/main.ts --action GetOutboxEvent --from {FROM_BLOCK} --to {TO_BLOCK} --l1RpcUrl {YOUR_RPC_URL} --outputFile {OUTBOX_FILE} --outboxType {OUTBOX_TYPE}
```

2. Get all `L2ToL1Transaction`:
```
yarn ts-node ./src/main.ts --action GetWithdrawEvent --from {FROM_BLOCK} --to {TO_BLOCK} --l2RpcUrl {YOUR_RPC_URL} --outputFile {WITHDRAW_FILE}  
```

3. Get all estimate jsons:
```
yarn ts-node ./src/main.ts --action CompareAndGetEstimate --l2RpcUrl {YOUR_L2_RPC_URL} --l1RpcUrl {YOUR_L1_RPC_URL} --outputFile {THE_OUTPUTFILE} --outboxInput {OUTBOX_FILE} --withdrawInput {WITHDRAW_FILE}
```

## Json Returns
Here is the json example return:
```
  {
    l2txhash: 0xb104d0e35d86d468331a06ff69aa2f23ddc01ec3ee1e424d913452cf067fefb3,
    batchNumber: 391,
    indexInBatch: 2,
    returnType: 1,
    outbox: 0x760723CD2e632826c38Fef8CD438A4CC7E7E1A40,
    calldata: 0x9c5cfe0b0000000000000000000000000000000000000000000000000000000000000187000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000000050000000000000000000000004fa2ade5c9b814a8665d4967d4d1ecc6e814f8980000000000000000000000004fa2ade5c9b814a8665d4967d4d1ecc6e814f898000000000000000000000000000000000000000000000000000000000004efc50000000000000000000000000000000000000000000000000000000000c93954000000000000000000000000000000000000000000000000000000006139245e000000000000000000000000000000000000000000000000003932dd5ce2400000000000000000000000000000000000000000000000000000000000000001c00000000000000000000000000000000000000000000000000000000000000003bc0c233ebf6527f68b4041dae3f076df24b11c5cd19bd02982b0ec9b54d1250f8e055fab931ad3ad12f21f2d3509912d8b0a2d98e277c068692c7634e3e681c480e6a735d2e1f4a5249ceec44c1e8788bc2d9d5588af99a2b7fe4635ddc952f80000000000000000000000000000000000000000000000000000000000000000,
    targetAddr: 0x4fA2ade5C9B814a8665D4967D4d1Ecc6e814f898,
    targetCalldata: 0x,
    estimateGas: 192576
  }
```
Here is what the returnType codes are: 
```
export const NOT_INIT = 0;
export const SUCESS = 1;
export const ALREADY_SPENT = 2;
export const NO_OUTBOX_ENTRY = 3;
export const UNKNOWN_ERROR = 4;
export const HOP_ALREADY_CONFIRMED = 5;
```
When we see UNKNOWN_ERROR, the reason might be the following user execution will revert or some errors from rpc (If it is this type, we need rerun this).
