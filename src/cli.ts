import * as fs from 'fs-extra'
import resolve from 'resolve'
import { promisify } from 'util'
import { ConversionContext } from './convert/index'
import printDiff from 'print-diff'
import * as recast from 'recast'
import * as t from '@babel/types'
import * as Path from 'path'
import yargs from 'yargs'
import prettier from 'prettier'
import inquirer from 'inquirer'
import defaultParseFile from './util/defaultParseFile'

const { _: files } = yargs.argv

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
          console.log(file)
          await context.forFile(Path.resolve(file)).processFile()
        }
      )
    )
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error.stack)
    return
  }
  const diffs = await Promise.all(
    [...context.fileASTs.entries()].map(
      async ([file, ast]: [string, t.File]): Promise<{
        file: string
        original: string
        converted: string
      }> => {
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
          converted: prettier.format(recast.print(ast).code, prettierOptions),
        }
      }
    )
  )
  let convertedCount = 0
  for (const { file, original, converted } of diffs) {
    if (converted === original) {
      // eslint-disable-next-line no-console
      console.log('Unchanged:', file)
      continue
    }
    convertedCount++
    // eslint-disable-next-line no-console
    console.log(`\n\n${file}\n======================================\n\n`)
    printDiff(original, converted)
  }
  if (convertedCount === 0) return
  const { write } = await inquirer.prompt([
    {
      name: 'write',
      type: 'confirm',
      default: false,
    },
  ])
  if (!write) return
  await Promise.all(
    diffs.map(async ({ file, converted }) => {
      await fs.writeFile(file, converted, 'utf8')
      // eslint-disable-next-line no-console
      console.log('wrote', file)
    })
  )
}

go()
