#!/usr/bin/env node

import * as fs from 'fs-extra'
import resolve from 'resolve'
import { promisify } from 'util'
import { ConversionContext, FileConversionContext } from './convert/index'
import printDiff from 'print-diff'
import * as recast from 'recast'
import * as Path from 'path'
import yargs from 'yargs'
import prettier from 'prettier'
import inquirer from 'inquirer'
import defaultParseFile from './util/defaultParseFile'

const { _: files, quiet, write } = yargs
  .usage('$0 <files>')
  .option('q', {
    alias: 'quiet',
    type: 'boolean',
    describe: 'reduce output',
  })
  .option('w', {
    alias: 'write',
    type: 'boolean',
    describe: 'write without asking for confirmation',
  })
  .help().argv

if (!files.length) {
  yargs.showHelp()
  process.exit(1)
}

async function go(): Promise<void> {
  const context = new ConversionContext({
    parseFile: defaultParseFile,
    resolve: (file: string, options: { basedir: string }): Promise<string> =>
      promisify(resolve as any)(file, {
        ...options,
        extensions: ['.tsx', '.ts', '.jsx', '.js'],
      }) as any,
  })
  try {
    await Promise.all(
      files.map(
        async (file: string | number): Promise<void> => {
          if (typeof file !== 'string') return
          // eslint-disable-next-line no-console
          if (!quiet) console.error('Processing', file)
          await (await context.forFile(Path.resolve(file))).processFile()
        }
      )
    )
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error.stack)
    return
  }
  const diffs = await Promise.all(
    [...context.files()].map(
      async (
        context: FileConversionContext
      ): Promise<{
        file: string
        original: string
        converted: string
      }> => {
        const { file, processedAST, changed } = context
        if (!changed) {
          return {
            file,
            original: '',
            converted: '',
          }
        }
        const prettierOptions = (await prettier.resolveConfig(file)) || {}
        if (!prettierOptions.parser) {
          prettierOptions.parser = /\.tsx?$/.test(file)
            ? 'typescript'
            : 'babel-flow'
        }
        return {
          file,
          original: prettier.format(
            await fs.readFile(file, 'utf8'),
            prettierOptions
          ),
          converted: prettier.format(
            recast.print(processedAST).code,
            prettierOptions
          ),
        }
      }
    )
  )
  let convertedCount = 0
  for (const { file, original, converted } of diffs) {
    if (converted === original) {
      // eslint-disable-next-line no-console
      if (!quiet) console.error('Unchanged:', file)
      continue
    }
    convertedCount++
    // eslint-disable-next-line no-console
    console.error(`\n\n${file}\n======================================`)
    printDiff(original, converted)
  }
  if (convertedCount === 0) return
  if (!write) {
    const { write: _write } = await inquirer.prompt([
      {
        name: 'write',
        type: 'confirm',
        default: false,
      },
    ])
    if (!_write) return
  }
  await Promise.all(
    diffs
      .filter(d => d.converted !== d.original)
      .map(async ({ file, converted }) => {
        await fs.writeFile(file, converted, 'utf8')
        // eslint-disable-next-line no-console
        if (!quiet) console.error('wrote', file)
      })
  )
  process.exit(0)
}

go()
