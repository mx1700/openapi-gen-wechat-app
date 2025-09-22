#!/usr/bin/env node

import { Command } from 'commander';
import { generateClient } from './generator';

const program = new Command();

program
  .name('openapi-gen-wechat-app')
  .description('Generate WeChat Mini Program client code from OpenAPI definition')
  .version('1.0.5');

program
  .argument('<input>', 'Path to swagger.json file or URL')
  .argument('<output>', 'Output directory for generated code')
  .action(async (input: string, output: string) => {
    try {
      await generateClient(input, output);
      console.log('Client code generated successfully!');
    } catch (error) {
      console.error('Error generating client code:', error);
      process.exit(1);
    }
  });

program.parse();