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
yarn ts-node ./src/main.ts --action GetWithdrawEvent --from {FROM_BLOCK} --to {TO_BLOCK} --l1RpcUrl {YOUR_L1_RPC_URL} --l2RpcUrl {YOUR_RPC_URL} --outputFile {WITHDRAW_FILE}  
```

3. Get all estimate jsons:
```
yarn ts-node ./src/main.ts --action CompareAndGetEstimate --l1RpcUrl {YOUR_L1_RPC_URL} --outputFile {THE_OUTPUTFILE} --outboxInput {OUTBOX_FILE} --withdrawInput {WITHDRAW_FILE}
```

## Json Returns
Here is the json example return:
```
  {
    l2txhash: 0xc23885d0f8aeffeed1e4179aa893cc95c482fa4c655002ecd2fbefc90cc87c35,
    batchNumber: 1,
    path: 102,
    returnType: 1,
    outbox: 0x667e23ABd27E623c11d4CC00ca3EC4d0bD63337a,
    calldata: 0x9c5cfe0b000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000066000000000000000000000000a4b1000f5ca40800ba79e374fc955e807692bee6000000000000000000000000a4b1000e32a324c79b72c0b3b729f7ba014b2c4d000000000000000000000000000000000000000000000000000000000000028e0000000000000000000000000000000000000000000000000000000000bff7440000000000000000000000000000000000000000000000000000000060bcb0d7000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000002400000000000000000000000000000000000000000000000000000000000000007d061a1e0357bb1471b98e04a9bedbf06eb1db6280f65a22348e2a9821b3221525a735a2c9ad77a85b5e032bcd134eb7e880e76129a2f62ca0d806a43eb88d39505b258877bf94fcca1261e6fd15a1c5103a4b9d3d493c0d47d830ef374ed69aee9ae7b37e827ee84d79f9480d83c94507aa742000473db83b283bc7b5e8689929c0619a0b75b9e39aa89dc496a6192ba8ca6266882b3cc54d9dc892cc62c357805dee5cdb1624eb84ee8dd1f1f97d903a20a5556c6f013b9819f1bbcb4b404d32c136285871e91efa6b853c9d0d522af230de67f9302cc50d9e0e4a7fbc6b3a90000000000000000000000000000000000000000000000000000000000000000,
    targetAddr: 0xa4B1000E32a324c79B72C0B3b729F7BA014B2c4D,
    targetCalldata: 0x,
    estimateGas: 221177
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
