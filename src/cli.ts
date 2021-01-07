import * as fs from 'fs-extra'
import resolve from 'resolve'
import { parse } from '@babel/parser'
import { promisify } from 'util'
import { ConversionContext } from './convert/index'
import printDiff from 'print-diff'
import * as recast from 'recast'
import * as t from '@babel/types'
import * as Path from 'path'
import yargs from 'yargs'
import prettier from 'prettier'

const { _: files } = yargs.argv

async function parseFile(file: string): Promise<t.File> {
  return recast.parse(await fs.readFile(file, 'utf8'), {
    parser: {
      parse: (code: string): any =>
        parse(code, {
          plugins: [
            /\.tsx?$/.test(file) ? 'typescript' : ['flow', { all: true }],
            'jsx',
            'classProperties',
            'exportDefaultFrom',
            'asyncGenerators',
            'objectRestSpread',
            'optionalChaining',
            'exportDefaultFrom',
            'exportNamespaceFrom',
            'dynamicImport',
            'nullishCoalescingOperator',
            'bigint' as any,
          ],
          tokens: true,
          sourceType: 'unambiguous',
        }),
    },
  })
}

async function go() {
  const context = new ConversionContext({
    parseFile,
    resolve: promisify(resolve) as any,
  })
  try {
    for (const file of files) {
      if (typeof file !== 'string') continue
      // eslint-disable-next-line no-console
      console.log(file)
      await context.forFile(Path.resolve(file)).processFile()
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error.stack)
  }
  for (const [file, ast] of context.fileASTs.entries()) {
    const prettierOptions = {
      parser: /\.tsx?$/.test(file) ? 'typescript' : 'babel',
    }
    const printed = prettier.format(recast.print(ast).code, prettierOptions)
    const orig = prettier.format(
      await fs.readFile(file, 'utf8'),
      prettierOptions
    )
    if (orig === printed) {
      // eslint-disable-next-line no-console
      console.log(file)
      continue
    }
    // eslint-disable-next-line no-console
    console.log(`\n\n${file}\n======================================\n\n`)
    printDiff(orig, printed)
  }
}

go()
