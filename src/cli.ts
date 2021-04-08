#!/usr/bin/env node

import * as fs from 'fs-extra'
import resolve from 'resolve'
import { promisify } from 'util'
import ConversionContext, {
  FileConversionContext,
} from './convert/ConversionContext'
import printDiff from './util/printDiff'
import * as recast from 'recast'
import * as Path from 'path'
import yargs from 'yargs'
import prettier from 'prettier'
import inquirer from 'inquirer'
import { getParserAsync } from 'babel-parse-wild-code'
import ansiEscapes from 'ansi-escapes'
import { glob, hasMagic } from 'glob-gitignore'

const {
  _: fileArgs,
  quiet,
  write,
  check,
  'default-exact': defaultExact,
} = yargs
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
  .option('c', {
    alias: 'check',
    type: 'boolean',
    describe: 'check that all validators match types',
  })
  .option('default-exact', {
    type: 'boolean',
    describe: 'whether to treat ambiguously exact objects as exact or inexact',
  })
  .help().argv

if (!fileArgs.length) {
  yargs.showHelp()
  process.exit(1)
}

let needsClear = false

const clearTemporary = () => {
  if (needsClear && !process.env.DEBUG_ARE_ASTS_EQUAL) {
    process.stderr.write(
      ansiEscapes.cursorRestorePosition + ansiEscapes.eraseDown
    )
    needsClear = false
  }
}

const writeTemporary = (text: string) => {
  clearTemporary()
  process.stderr.write(text)
  needsClear = true
}

async function go(): Promise<void> {
  const files = []
  for (const arg of fileArgs) {
    if (typeof arg !== 'string') continue
    if (hasMagic(arg)) {
      for (const file of await glob(arg)) files.push(file)
    } else {
      files.push(arg)
    }
  }

  const context = new ConversionContext({
    parseFile: async (file: string) =>
      recast.parse(await fs.readFile(file, 'utf8'), {
        parser: await getParserAsync(file, { tokens: true }),
      }),
    defaultExact,
    resolve: (file: string, options: { basedir: string }): Promise<string> =>
      promisify(resolve as any)(file, {
        ...options,
        extensions: ['.tsx', '.ts', '.jsx', '.js'],
      }) as any,
  })
  try {
    process.stdout.write(ansiEscapes.cursorSavePosition)
    await Promise.all(
      files.map(
        async (file: string): Promise<void> => {
          await (await context.forFile(Path.resolve(file))).processFile()
          if (!quiet) writeTemporary(file)
        }
      )
    )
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error.stack)
    process.exit(2)
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
        if (!quiet) writeTemporary(context.file)
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

  clearTemporary()

  if (check) {
    let convertedCount = 0
    for (const { file, original, converted } of diffs) {
      if (converted !== original) {
        // eslint-disable-next-line no-console
        if (!quiet) console.warn(file)
        convertedCount++
      }
    }
    if (convertedCount) {
      if (!quiet)
        // eslint-disable-next-line no-console
        console.warn(`${convertedCount} files need validators updated.`)
      process.exit(1)
    }
    if (!quiet)
      // eslint-disable-next-line no-console
      console.warn(`All matched files are up-to-date!`)
    process.exit(0)
  }
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
  if (convertedCount === 0) process.exit(0)
  if (!write) {
    const { write: _write } = await inquirer.prompt([
      {
        name: 'write',
        type: 'confirm',
        default: false,
      },
    ])
    if (!_write) process.exit(0)
  }
  await Promise.all(
    diffs
      .filter((d) => d.converted !== d.original)
      .map(async ({ file, converted }) => {
        await fs.writeFile(file, converted, 'utf8')
        // eslint-disable-next-line no-console
        if (!quiet) console.error('wrote', file)
      })
  )
  process.exit(0)
}

go()
