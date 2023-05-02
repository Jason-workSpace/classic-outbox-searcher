'use strict';
import yargs from 'yargs/yargs';

const argv = yargs(process.argv.slice(2))
  .options({
    action: {
      type: 'string',
    },
    from: {
      type: 'number',
    },
    to: {
      type: 'number',
    },
    outputFile: {
      type: 'string',
    },
    withdrawInput: {
      type: 'string',
    },
    outboxInput: {
      type: 'string',
    },
    l1RpcUrl: {
      type: 'string',
    },
    l2RpcUrl: {
      type: 'string',
    },
  })
  .demandOption('action')
  .demandOption('outputFile')
  .parseSync();

export default argv;
