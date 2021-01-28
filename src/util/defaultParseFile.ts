import * as t from '@babel/types'
import { resolveInDir } from './resolveInDir'
import path from 'path'
import { findRoot } from './findRoot'
import fs from 'fs-extra'
import { parse as babelParse } from '@babel/parser'
import * as recast from 'recast'

export default async function defaultParseFile(file: string): Promise<t.File> {
  const code = await fs.readFile(file, 'utf8')

  const projectDirectory = await findRoot(file)

  let parse: (code: string) => t.File | t.Program = (code: string): t.File =>
    babelParse(code, {
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
    })

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const babel = require(await resolveInDir('@babel/core', path.dirname(file)))
    const options = await babel.loadOptions({
      cwd: projectDirectory,
      filename: file,
      rootMode: 'upward-optional',
    })
    if (options.plugins?.length || options.presets?.length) {
      parse = (code: string): t.File | t.Program => {
        const result = babel.parseSync(code, {
          ...options,
          parserOpts: { ...options.parserOpts, tokens: true },
        })
        if (result?.type !== 'File' && result?.type !== 'Program') {
          throw new Error(
            'expected result of parseAsync to be a File or Program node'
          )
        }
        return result as t.File | t.Program
      }
    }
  } catch (error) {
    // fallthrough
  }

  return recast.parse(code, { parser: { parse } })
}
